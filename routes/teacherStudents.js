const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

// Get all students (filtered by teacher's trade)
router.get('/', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        // Get teacher's trade
        const [teacherRows] = await db.query('SELECT trade FROM teachers WHERE id = ?', [teacherId]);
        if (teacherRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Teacher profile error' });
        }
        const trade = teacherRows[0].trade;

        // Get students in that trade
        // Excluding sensitive fields like password
        const [students] = await db.query(
            `SELECT id, full_name, email, phone_number AS phone, trade, level, status, created_at 
       FROM students 
       WHERE trade = ?
       ORDER BY full_name ASC`,
            [trade]
        );

        res.json({
            success: true,
            students
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

        const [rows] = await db.query(
            `SELECT id, full_name, email, phone_number AS phone, trade, level, status, created_at 
         FROM students WHERE id = ?`,
            [studentId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Optional: Get recent performance/attendance for this student context
        // This could be enhanced later

        res.json({
            success: true,
            student: rows[0]
        });

    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch student details' });
    }
});

module.exports = router;
