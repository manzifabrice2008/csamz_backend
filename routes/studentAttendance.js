const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { authenticateToken } = require('../middleware/auth');

// Get attendance history
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { month, year } = req.query;
        let query = { student_id: req.user.id };

        if (month && year) {
            const startDate = new Date(year, month - 1, 1).toISOString();
            const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
            query.date = { $gte: startDate, $lte: endDate };
        }

        const rows = await Attendance.find(query).sort({ date: -1 }).lean();

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

        const rows = await Attendance.find({ student_id: req.user.id }).select('status').lean();

        const summary = {
            present: 0,
            absent: 0,
            late: 0,
            excused: 0
        };

        rows.forEach(row => {
            if (summary.hasOwnProperty(row.status)) {
                summary[row.status]++;
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
