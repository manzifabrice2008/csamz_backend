const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const { authenticateToken } = require('../middleware/auth');
const { getTeacherTrades, getTeacherLevels } = require('../utils/teacherAssignments');

const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildTradeFilter = (trades) => {
    const normalizedTrades = Array.isArray(trades) ? trades.filter(Boolean) : [];
    if (normalizedTrades.length === 0) {
        return {};
    }

    return {
        $or: normalizedTrades.map((trade) => ({
            trade: { $regex: `^${escapeRegex(trade.trim())}$`, $options: 'i' }
        }))
    };
};

const buildLevelFilter = (levels) => {
    const normalizedLevels = Array.isArray(levels) ? levels.filter(Boolean) : [];
    const conditions = [];

    normalizedLevels.forEach((level) => {
        const levelNumber = String(level).replace(/[^0-9]/g, '');
        const patterns = [
            `^${escapeRegex(level)}$`,
            `^Level\\s*${escapeRegex(levelNumber)}$`,
        ];

        if (levelNumber) {
            patterns.push(`^${escapeRegex(levelNumber)}$`);
            patterns.push(`^L\\s*${escapeRegex(levelNumber)}$`);
        }

        conditions.push({
            $or: patterns.map((pattern) => ({
                level: { $regex: pattern, $options: 'i' }
            }))
        });
    });

    if (normalizedLevels.includes('L3')) {
        conditions.push({ level: { $exists: false } });
        conditions.push({ level: null });
        conditions.push({ level: '' });
    }

    return conditions.length > 0 ? { $or: conditions } : {};
};

router.get('/stats', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        const teacher = await Teacher.findById(teacherId).select('trade trades level levels').lean();
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher not found' });
        }

        const trades = getTeacherTrades(teacher);
        const levels = getTeacherLevels(teacher);
        const trade = trades.join(', ');

        const totalStudents = await Student.countDocuments({
            ...buildTradeFilter(trades),
            ...buildLevelFilter(levels)
        });
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
