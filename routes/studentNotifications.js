const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const userType = req.user.role; // 'student', 'teacher', 'admin'
        let dbUserType = userType;
        if (userType === 'super_admin') dbUserType = 'admin';

        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('user_type', dbUserType)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // Get unread count
        const { count, error: countError } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id)
            .eq('user_type', dbUserType)
            .eq('is_read', false);

        if (countError) throw countError;

        res.json({
            success: true,
            notifications,
            unreadCount: count || 0
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark as read
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('user_id', req.user.id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark all as read
router.put('/read-all', authenticateToken, async (req, res) => {
    try {
        const userType = req.user.role === 'super_admin' ? 'admin' : req.user.role;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', req.user.id)
            .eq('user_type', userType);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
