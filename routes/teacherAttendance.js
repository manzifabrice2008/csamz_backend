const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { getTeacherTrades } = require('../utils/teacherAssignments');

const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

// POST / - Mark attendance for multiple students
router.post('/', authenticateToken, ensureTeacher, [
    body('date').isISO8601().toDate().withMessage('Valid date is required'),
    body('attendance').isArray().withMessage('Attendance data must be an array'),
    body('attendance.*.student_id').notEmpty().withMessage('Student ID is required'),
    body('attendance.*.status').isIn(['present', 'absent', 'late', 'excused']),
    body('attendance.*.remarks').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const teacherId = req.user.id;
        const { date, attendance } = req.body;

        const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD

        const bulkOps = attendance.map(record => ({
            updateOne: {
                filter: { student_id: record.student_id, date: dateStr },
                update: {
                    $set: {
                        status: record.status,
                        remarks: record.remarks || null,
                        recorded_by: teacherId
                    }
                },
                upsert: true
            }
        }));

        await Attendance.bulkWrite(bulkOps);

        res.json({ success: true, message: 'Attendance recorded successfully' });

    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ success: false, message: 'Failed to record attendance' });
    }
});

// GET /history - Get attendance history for teacher's view
router.get('/history', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const { date, student_id } = req.query;

        const teacher = await Teacher.findById(req.user.id).select('trade trades').lean();
        if (!teacher) throw new Error('Teacher not found');
        const trades = getTeacherTrades(teacher);

        let studentIdsToQuery = [];
        
        if (student_id) {
            // Verify student is in teacher's trade
            const student = await Student.findOne({ _id: student_id, trade: { $in: trades } }).lean();
            if (student) {
                studentIdsToQuery.push(student._id);
            }
        } else {
            // Get all students in teacher's trade
            const studentsInTrade = await Student.find({ trade: { $in: trades } }).select('_id').lean();
            studentIdsToQuery = studentsInTrade.map(s => s._id);
        }

        if (studentIdsToQuery.length === 0) {
            return res.json({ success: true, attendance: [] });
        }

        const query = { student_id: { $in: studentIdsToQuery } };
        if (date) {
            query.date = date;
        }

        const rows = await Attendance.find(query)
            .sort({ date: -1 })
            .populate('student_id', 'full_name trade')
            .lean();

        const formattedRows = rows.map(row => ({
            id: row._id,
            ...row,
            full_name: row.student_id?.full_name,
            trade: row.student_id?.trade,
            student_id: row.student_id?._id
        }));

        res.json({ success: true, attendance: formattedRows });

    } catch (error) {
        console.error('Get attendance history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance history' });
    }
});

module.exports = router;
