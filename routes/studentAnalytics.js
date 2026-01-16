const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get student overall statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const studentId = req.user.id;

        // 1. Attendance Rate
        const [attendanceRows] = await db.query(
            `SELECT 
         COUNT(*) as total_days,
         SUM(CASE WHEN status IN ('present', 'late', 'excused') THEN 1 ELSE 0 END) as present_days
       FROM attendance 
       WHERE student_id = ?`,
            [studentId]
        );

        const totalDays = attendanceRows[0].total_days || 0;
        const presentDays = attendanceRows[0].present_days || 0;
        const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

        // 2. Assignment Completion
        // Total assignments for their trade/level vs submitted
        const [studentInfo] = await db.query(
            'SELECT trade, level FROM students WHERE id = ?',
            [studentId]
        );

        let assignmentCompletion = 0;
        if (studentInfo.length > 0) {
            const { trade, level } = studentInfo[0];
            const [assignmentStats] = await db.query(
                `SELECT 
           (SELECT COUNT(*) FROM assignments WHERE trade = ? AND level = ?) as total_assignments,
           (SELECT COUNT(*) FROM student_assignment_submissions WHERE student_id = ?) as submitted_assignments`,
                [trade, level, studentId]
            );

            const totalAssignments = assignmentStats[0].total_assignments || 0;
            const submittedAssignments = assignmentStats[0].submitted_assignments || 0;
            assignmentCompletion = totalAssignments > 0 ? Math.round((submittedAssignments / totalAssignments) * 100) : 0;
        }

        // 3. Average Grades (Exams + Assignments)
        // For now, let's just pull from exam results as primarily implemented
        const [gradeRows] = await db.query(
            `SELECT AVG(score) as avg_score FROM results WHERE student_id = ?`,
            [studentId]
        );
        const averageGrade = gradeRows[0].avg_score ? Math.round(gradeRows[0].avg_score) : 0;

        res.json({
            success: true,
            stats: {
                attendance: attendanceRate,
                assignments: assignmentCompletion,
                grades: averageGrade,
                // You can add more specific counts if needed
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
        const [results] = await db.query(
            `SELECT 
                e.title as exam_name, 
                r.score, 
                r.submitted_at as date 
             FROM results r
             JOIN exams e ON r.exam_id = e.id
             WHERE r.student_id = ?
             ORDER BY r.submitted_at ASC
             LIMIT 10`,
            [studentId]
        );

        res.json({
            success: true,
            performanceData: results
        });

    } catch (error) {
        console.error('Get student performance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
