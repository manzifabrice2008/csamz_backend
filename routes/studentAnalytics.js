const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Result = require('../models/Result');
const { authenticateToken } = require('../middleware/auth');

// Get student overall statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const studentId = req.user.id;

        // 1. Attendance Rate
        const attendanceRows = await Attendance.find({ student_id: studentId }).select('status').lean();
        const totalDays = attendanceRows.length;
        const presentDays = attendanceRows.filter(r => ['present', 'late', 'excused'].includes(r.status)).length;
        const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

        // 2. Assignment Completion
        const student = await Student.findById(studentId).select('trade level').lean();
        
        let assignmentCompletion = 0;
        let classRank = null;
        let classSize = 0;
        if (student) {
            const { trade, level } = student;
            const totalAssignments = await Assignment.countDocuments({ trade, level });
            const submittedAssignments = await Submission.countDocuments({ student_id: studentId });
            assignmentCompletion = totalAssignments > 0 ? Math.round((submittedAssignments / totalAssignments) * 100) : 0;

            const classmates = await Student.find({ trade, level, status: 'active' }).select('_id').lean();
            classSize = classmates.length;

            const classmateIds = classmates.map((row) => row._id);
            const classResults = await Result.find({ student_id: { $in: classmateIds } })
                .populate('exam_id', 'total_marks')
                .select('student_id score exam_id submitted_at createdAt')
                .lean();

            const totalsByStudent = new Map();

            classResults.forEach((row) => {
                const totalMarks = row.exam_id?.total_marks || 0;
                const percentage = totalMarks > 0 ? (row.score / totalMarks) * 100 : 0;
                const key = String(row.student_id);
                const current = totalsByStudent.get(key) || { totalPercentage: 0, exams: 0 };
                current.totalPercentage += percentage;
                current.exams += 1;
                totalsByStudent.set(key, current);
            });

            const rankedStudents = classmates
                .map((classmate) => {
                    const totals = totalsByStudent.get(String(classmate._id)) || { totalPercentage: 0, exams: 0 };
                    const averagePercentage = totals.exams > 0 ? totals.totalPercentage / totals.exams : 0;
                    return {
                        student_id: String(classmate._id),
                        averagePercentage: Math.round(averagePercentage),
                    };
                })
                .sort((a, b) => b.averagePercentage - a.averagePercentage);

            const currentStudentIndex = rankedStudents.findIndex((row) => row.student_id === String(studentId));
            classRank = currentStudentIndex >= 0 ? currentStudentIndex + 1 : null;
        }

        // 3. Average Grades (Exams)
        const gradeRows = await Result.find({ student_id: studentId }).select('score').lean();
        const scores = gradeRows.map(r => r.score);
        const averageGrade = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        res.json({
            success: true,
            stats: {
                attendance: attendanceRate,
                assignments: assignmentCompletion,
                grades: averageGrade,
                class_rank: classRank,
                class_size: classSize,
                total_attendance_days: totalDays,
                present_attendance_days: presentDays
            }
        });

    } catch (error) {
        console.error('Get student analytics stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get performance data for charts
router.get('/performance', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const studentId = req.user.id;

        const results = await Result.find({ student_id: studentId })
            .sort({ submitted_at: 1 })
            .limit(10)
            .populate('exam_id', 'title')
            .lean();

        const formattedResults = results.map(r => ({
            exam_name: r.exam_id?.title,
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
