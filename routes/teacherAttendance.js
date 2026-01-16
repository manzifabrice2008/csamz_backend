const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
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

        const dateStr = date.toISOString().slice(0, 10); // Use YYYY-MM-DD for attendance uniqueness usually

        const upsertPayload = attendance.map(record => ({
            student_id: record.student_id,
            date: dateStr,
            status: record.status,
            remarks: record.remarks || null,
            recorded_by: teacherId
        }));

        const { error } = await supabase
            .from('attendance')
            .upsert(upsertPayload, { onConflict: 'student_id,date' });

        if (error) throw error;

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

        // Filter by teacher's trade (security so they don't see others)
        const { data: teacher, error: tError } = await supabase
            .from('teachers')
            .select('trade')
            .eq('id', req.user.id)
            .single();

        if (tError) throw tError;

        let query = supabase
            .from('attendance')
            .select('*, student:students!inner(full_name, trade)')
            .eq('student.trade', teacher.trade);

        if (date) {
            query = query.eq('date', date);
        }

        if (student_id) {
            query = query.eq('student_id', student_id);
        }

        const { data: rows, error } = await query.order('date', { ascending: false });

        if (error) throw error;

        const formattedRows = rows.map(row => ({
            ...row,
            full_name: row.student?.full_name,
            trade: row.student?.trade
        }));

        res.json({ success: true, attendance: formattedRows });

    } catch (error) {
        console.error('Get attendance history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance history' });
    }
});

module.exports = router;
