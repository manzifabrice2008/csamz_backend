const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get attendance history
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { month, year } = req.query;
        let query = 'SELECT * FROM attendance WHERE student_id = ?';
        let params = [req.user.id];

        if (month && year) {
            query += ' AND MONTH(date) = ? AND YEAR(date) = ?';
            params.push(month, year);
        }

        query += ' ORDER BY date DESC';

        const [rows] = await db.query(query, params);

        res.json({
            success: true,
            attendance: rows
        });
    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get attendance summary
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const [rows] = await db.query(
            `SELECT 
                status, 
                COUNT(*) as count 
             FROM attendance 
             WHERE student_id = ? 
             GROUP BY status`,
            [req.user.id]
        );

        const summary = {
            present: 0,
            absent: 0,
            late: 0,
            excused: 0
        };

        rows.forEach(row => {
            if (summary.hasOwnProperty(row.status)) {
                summary[row.status] = row.count;
            }
        });

        res.json({
            success: true,
            summary
        });

    } catch (error) {
        console.error('Get attendance summary error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
