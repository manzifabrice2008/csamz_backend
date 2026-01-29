const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
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

        // Insert visit record
        const { error } = await supabase
            .from('site_analytics')
            .insert([{
                page_path: path,
                visited_at: new Date().toISOString()
            }]);

        if (error) {
            // If table doesn't exist, log it but don't crash
            if (error.code === '42P01') {
                console.error('⚠️ site_analytics table not found in Supabase. Please run the SQL migration.');
                return res.status(200).json({ success: true, warning: 'Table missing' });
            }
            throw error;
        }

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

        // 1. Get Monthly Visitors (Current Month)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const { count: monthlyCount, error: monthlyError } = await supabase
            .from('site_analytics')
            .select('*', { count: 'exact', head: true })
            .gte('visited_at', startOfMonth.toISOString());

        if (monthlyError && monthlyError.code !== '42P01') throw monthlyError;

        // 2. Get Last Month Visitors for Trend
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const { count: lastMonthCount, error: altError } = await supabase
            .from('site_analytics')
            .select('*', { count: 'exact', head: true })
            .gte('visited_at', startOfLastMonth.toISOString())
            .lte('visited_at', endOfLastMonth.toISOString());

        if (altError && altError.code !== '42P01') throw altError;

        // 3. Get Total Visitors (All time)
        const { count: totalCount, error: tError } = await supabase
            .from('site_analytics')
            .select('*', { count: 'exact', head: true });

        if (tError && tError.code !== '42P01') throw tError;

        // Calculate trend percentage
        let trend = 0;
        if (lastMonthCount > 0) {
            trend = Math.round(((monthlyCount - lastMonthCount) / lastMonthCount) * 100);
        } else if (monthlyCount > 0) {
            trend = 100; // 100% up if starting from 0
        }

        res.json({
            success: true,
            stats: {
                monthly_visitors: monthlyCount || 0,
                last_month_visitors: lastMonthCount || 0,
                total_visitors: totalCount || 0,
                trend: trend,
                is_table_missing: monthlyError?.code === '42P01'
            }
        });

    } catch (error) {
        console.error('Get analytics overview error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
