const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get student overall statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const studentId = req.user.id;

        // 1. Attendance Rate
        const { data: attendanceRows, error: attError } = await supabase
            .from('attendance')
            .select('status')
            .eq('student_id', studentId);

        if (attError) throw attError;

        const totalDays = attendanceRows.length;
        const presentDays = attendanceRows.filter(r => ['present', 'late', 'excused'].includes(r.status)).length;
        const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

        // 2. Assignment Completion
        const { data: student, error: sError } = await supabase
            .from('students')
            .select('trade, level')
            .eq('id', studentId)
            .single();

        if (sError) throw sError;

        let assignmentCompletion = 0;
        const { trade, level } = student;

        // Total assignments for their trade/level
        const { count: totalAssignments, error: aError } = await supabase
            .from('assignments')
            .select('*', { count: 'exact', head: true })
            .eq('trade', trade)
            .eq('level', level);

        if (aError) throw aError;

        // Submitted assignments
        const { count: submittedAssignments, error: subError } = await supabase
            .from('student_assignment_submissions')
            .select('*', { count: 'exact', head: true })
            .eq('student_id', studentId);

        if (subError) throw subError;

        assignmentCompletion = totalAssignments > 0 ? Math.round((submittedAssignments / totalAssignments) * 100) : 0;

        // 3. Average Grades (Exams)
        const { data: gradeRows, error: gError } = await supabase
            .from('results')
            .select('score')
            .eq('student_id', studentId);

        if (gError) throw gError;

        const scores = gradeRows.map(r => r.score);
        const averageGrade = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        res.json({
            success: true,
            stats: {
                attendance: attendanceRate,
                assignments: assignmentCompletion,
                grades: averageGrade,
                total_attendance_days: totalDays,
                present_attendance_days: presentDays
            }
        });

    } catch (error) {
        console.error('Get student analytics stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get performance data for charts (e.g., grades over time)
router.get('/performance', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const studentId = req.user.id;

        // Get exam results ordered by date
        const { data: results, error } = await supabase
            .from('results')
            .select('score, submitted_at, exam:exams(title)')
            .eq('student_id', studentId)
            .order('submitted_at', { ascending: true })
            .limit(10);

        if (error) throw error;

        const formattedResults = results.map(r => ({
            exam_name: r.exam?.title,
            score: r.score,
            date: r.submitted_at
        }));

        res.json({
            success: true,
            performanceData: formattedResults
        });

    } catch (error) {
        console.error('Get student performance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
