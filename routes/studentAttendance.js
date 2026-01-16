const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get attendance history
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { month, year } = req.query;
        let query = supabase
            .from('attendance')
            .select('*')
            .eq('student_id', req.user.id);

        if (month && year) {
            // PostgreSQL month/year extraction
            const startDate = new Date(year, month - 1, 1).toISOString();
            const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
            query = query.gte('date', startDate).lte('date', endDate);
        }

        const { data: rows, error } = await query.order('date', { ascending: false });

        if (error) throw error;

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

        const { data: rows, error } = await supabase
            .from('attendance')
            .select('status')
            .eq('student_id', req.user.id);

        if (error) throw error;

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
