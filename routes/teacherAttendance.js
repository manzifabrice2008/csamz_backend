const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

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
    body('attendance.*.student_id').isInt().withMessage('Student ID is required'),
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

        // Format date for MySQL
        const dateObj = new Date(date);
        const formattedDate = dateObj.toISOString().slice(0, 19).replace('T', ' ');

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            for (const record of attendance) {
                // Upsert attendance record
                await connection.query(
                    `INSERT INTO attendance (student_id, date, status, remarks, recorded_by)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE status = VALUES(status), remarks = VALUES(remarks), recorded_by = VALUES(recorded_by)`,
                    [record.student_id, formattedDate, record.status, record.remarks || null, teacherId]
                );
            }

            await connection.commit();
            res.json({ success: true, message: 'Attendance recorded successfully' });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ success: false, message: 'Failed to record attendance' });
    }
});

// GET /history - Get attendance history for teacher's view (e.g. for a specific date or student)
router.get('/history', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const { date, student_id } = req.query;
        let query = `SELECT a.*, s.full_name, s.trade 
                     FROM attendance a
                     JOIN students s ON s.id = a.student_id`;
        const params = [];
        const conditions = [];

        // Filter by teacher's trade (security so they don't see others)
        const [teacherRows] = await db.query('SELECT trade FROM teachers WHERE id = ?', [req.user.id]);
        const trade = teacherRows[0].trade;

        conditions.push('s.trade = ?');
        params.push(trade);

        if (date) {
            conditions.push('DATE(a.date) = ?');
            params.push(date);
        }

        if (student_id) {
            conditions.push('a.student_id = ?');
            params.push(student_id);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY a.date DESC';

        const [rows] = await db.query(query, params);

        res.json({ success: true, attendance: rows });

    } catch (error) {
        console.error('Get attendance history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance history' });
    }
});

module.exports = router;
