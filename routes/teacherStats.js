const express = require('express');
const router = express.Router();
const db = require('../config/database');
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
        const [teacherRows] = await db.query('SELECT trade FROM teachers WHERE id = ?', [teacherId]);
        if (teacherRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }
        const trade = teacherRows[0].trade;

        // 1. Total Students (in same trade)
        const [studentRows] = await db.query(
            'SELECT COUNT(*) as count FROM students WHERE trade = ?',
            [trade]
        );
        const totalStudents = studentRows[0].count;

        // 2. Active Assignments (created by this teacher)
        // Assuming active means deadline is in the future or recently passed? 
        // For now, let's just count all assignments created by this teacher
        const [assignmentRows] = await db.query(
            'SELECT COUNT(*) as count FROM assignments WHERE teacher_id = ?',
            [teacherId]
        );
        const totalAssignments = assignmentRows[0].count;

        // 3. Pending Grading (submissions for teacher's assignments that are not graded)
        const [submissionRows] = await db.query(
            `SELECT COUNT(*) as count 
       FROM student_assignment_submissions sas
       JOIN assignments a ON sas.assignment_id = a.id
       WHERE a.teacher_id = ? AND sas.grade IS NULL`,
            [teacherId]
        );
        const pendingGrading = submissionRows[0].count;

        // 4. Upcoming Exams (created by teacher)
        const [examRows] = await db.query(
            'SELECT COUNT(*) as count FROM exams WHERE teacher_id = ?',
            [teacherId]
        );
        const totalExams = examRows[0].count;

        res.json({
            success: true,
            stats: {
                totalStudents,
                totalAssignments,
                pendingGrading,
                totalExams,
                trade // beneficial for frontend to know which trade data is being shown
            }
        });

    } catch (error) {
        console.error('Teacher stats error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching stats' });
    }
});

module.exports = router;
