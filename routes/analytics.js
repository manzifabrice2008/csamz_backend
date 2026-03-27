const express = require('express');
const router = express.Router();
const SiteAnalytics = require('../models/SiteAnalytics');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route POST /api/analytics/track
 * @desc Track a page visit
 * @access Public
 */
router.post('/track', async (req, res) => {
    try {
        const { path } = req.body;
        if (!path) return res.status(400).json({ success: false, message: 'Path is required' });

        await SiteAnalytics.create({
            page_path: path,
            visited_at: new Date()
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Track visit error:', error);
        res.status(500).json({ success: false });
    }
});

/**
 * @route GET /api/analytics/overview
 * @desc Get visitor statistics for admin dashboard
 * @access Private (Admin)
 */
router.get('/overview', authenticateToken, async (req, res) => {
    try {
        if (!['admin', 'super_admin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const monthlyCount = await SiteAnalytics.countDocuments({
            visited_at: { $gte: startOfMonth }
        });

        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const lastMonthCount = await SiteAnalytics.countDocuments({
            visited_at: { $gte: startOfLastMonth, $lte: endOfLastMonth }
        });

        const totalCount = await SiteAnalytics.countDocuments();
        const onlineThreshold = new Date(Date.now() - (5 * 60 * 1000));

        const [studentsTotal, studentsOnline, teachersTotal, teachersOnline] = await Promise.all([
            Student.countDocuments(),
            Student.countDocuments({
                status: 'active',
                last_seen_at: { $gte: onlineThreshold }
            }),
            Teacher.countDocuments({ status: 'approved' }),
            Teacher.countDocuments({
                status: 'approved',
                last_seen_at: { $gte: onlineThreshold }
            }),
        ]);

        let trend = 0;
        if (lastMonthCount > 0) {
            trend = Math.round(((monthlyCount - lastMonthCount) / lastMonthCount) * 100);
        } else if (monthlyCount > 0) {
            trend = 100;
        }

        res.json({
            success: true,
            stats: {
                monthly_visitors: monthlyCount || 0,
                last_month_visitors: lastMonthCount || 0,
                total_visitors: totalCount || 0,
                trend: trend,
                is_table_missing: false,
                students_total: studentsTotal || 0,
                students_online: studentsOnline || 0,
                teachers_total: teachersTotal || 0,
                teachers_online: teachersOnline || 0,
            }
        });

    } catch (error) {
        console.error('Get analytics overview error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
