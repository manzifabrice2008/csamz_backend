const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const { authenticateToken } = require('../middleware/auth');

const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

router.get('/stats', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        const teacher = await Teacher.findById(teacherId).select('trade').lean();
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }

        const trade = teacher.trade;

        const totalStudents = await Student.countDocuments({ trade });
        const totalAssignments = await Assignment.countDocuments({ teacher_id: teacherId });
        
        // Find assignments created by this teacher
        const assignments = await Assignment.find({ teacher_id: teacherId }).select('_id').lean();
        const assignmentIds = assignments.map(a => a._id);

        const pendingGrading = await Submission.countDocuments({
            assignment_id: { $in: assignmentIds },
            grade: null
        });

        const totalExams = await Exam.countDocuments({ teacher_id: teacherId });

        res.json({
            success: true,
            stats: {
                totalStudents,
                totalAssignments,
                pendingGrading,
                totalExams,
                trade
            }
        });

    } catch (error) {
        console.error('Teacher stats error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching stats' });
    }
});

module.exports = router;
