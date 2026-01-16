const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Helper to ensure user is a teacher
const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

router.get('/stats', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        // Get teacher's trade to filter relevant students
        const { data: teacher, error: teacherError } = await supabase
            .from('teachers')
            .select('trade')
            .eq('id', teacherId)
            .single();

        if (teacherError) {
            if (teacherError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Teacher not found' });
            throw teacherError;
        }

        const trade = teacher.trade;

        // 1. Total Students (in same trade)
        const { count: totalStudents, error: sError } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('trade', trade);

        if (sError) throw sError;

        // 2. Total Assignments (created by this teacher)
        const { count: totalAssignments, error: aError } = await supabase
            .from('assignments')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', teacherId);

        if (aError) throw aError;

        // 3. Pending Grading (submissions for teacher's assignments that are not graded)
        const { count: pendingGrading, error: subError } = await supabase
            .from('student_assignment_submissions')
            .select('*, assignment:assignments!inner(teacher_id)', { count: 'exact', head: true })
            .eq('assignment.teacher_id', teacherId)
            .is('grade', null);

        if (subError) throw subError;

        // 4. Total Exams (created by teacher)
        const { count: totalExams, error: eError } = await supabase
            .from('exams')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', teacherId);

        if (eError) throw eError;

        res.json({
            success: true,
            stats: {
                totalStudents: totalStudents || 0,
                totalAssignments: totalAssignments || 0,
                pendingGrading: pendingGrading || 0,
                totalExams: totalExams || 0,
                trade // beneficial for frontend to know which trade data is being shown
            }
        });

    } catch (error) {
        console.error('Teacher stats error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching stats' });
    }
});

module.exports = router;
