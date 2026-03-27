const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { authenticateToken } = require('../middleware/auth');
const { getTeacherTrades, getTeacherLevels } = require('../utils/teacherAssignments');
const { normalizeStudentRecord } = require('../utils/studentClassification');

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

    // Backward compatibility: older student accounts were created before level was
    // persisted, so treat missing level as L3 because the student form defaulted to L3.
    if (normalizedLevels.includes('L3')) {
        conditions.push({ level: { $exists: false } });
        conditions.push({ level: null });
        conditions.push({ level: '' });
    }

    return conditions.length > 0 ? { $or: conditions } : {};
};

// Get all students filtered by the teacher's assigned trades and classes
router.get('/', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        const teacher = await Teacher.findById(teacherId).select('trade trades level levels').lean();
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher profile error' });
        }

        const trades = getTeacherTrades(teacher);
        const levels = getTeacherLevels(teacher);
        const levelFilter = buildLevelFilter(levels);

        const students = await Student.find({
            ...buildTradeFilter(trades),
            ...levelFilter
        })
            .select('_id full_name email phone_number trade level status createdAt')
            .sort({ level: 1, full_name: 1 })
            .lean();

        const formattedStudents = students.map((s) => {
            const normalized = normalizeStudentRecord(s);
            return {
                id: normalized._id,
                ...normalized,
                phone: normalized.phone_number,
                created_at: s.createdAt
            };
        });

        res.json({
            success: true,
            students: formattedStudents
        });

    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
});

// Get specific student details
router.get('/:id', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const studentId = req.params.id;
        const teacher = await Teacher.findById(req.user.id).select('trade trades level levels').lean();

        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher profile error' });
        }

        const trades = getTeacherTrades(teacher);
        const levels = getTeacherLevels(teacher);
        const levelFilter = buildLevelFilter(levels);

        const student = await Student.findOne({
            _id: studentId,
            ...buildTradeFilter(trades),
            ...levelFilter
        })
            .select('_id full_name email phone_number trade level status createdAt')
            .lean();

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({
            success: true,
            student: {
                id: student._id,
                ...normalizeStudentRecord(student),
                phone: student.phone_number,
                created_at: student.createdAt
            }
        });

    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch student details' });
    }
});

router.delete('/:id', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const studentId = req.params.id;
        const teacher = await Teacher.findById(req.user.id).select('trade trades level levels').lean();

        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher profile error' });
        }

        const trades = getTeacherTrades(teacher);
        const levels = getTeacherLevels(teacher);
        const levelFilter = buildLevelFilter(levels);

        const student = await Student.findOneAndDelete({
            _id: studentId,
            ...buildTradeFilter(trades),
            ...levelFilter
        }).lean();

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({
            success: true,
            message: 'Student deleted successfully'
        });
    } catch (error) {
        console.error('Teacher delete student error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete student' });
    }
});

module.exports = router;
