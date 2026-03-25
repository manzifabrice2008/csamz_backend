const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');

// Get notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        let userType = req.user.role;
        if (userType === 'super_admin') userType = 'admin';

        const notifications = await Notification.find({
            user_id: req.user.id,
            user_type: userType
        }).sort({ createdAt: -1 }).limit(50).lean();

        // Map _id to id to maintain backwards compatibility
        const mapped = notifications.map(n => ({ id: n._id, ...n }));

        const unreadCount = await Notification.countDocuments({
            user_id: req.user.id,
            user_type: userType,
            is_read: false
        });

        res.json({
            success: true,
            notifications: mapped,
            unreadCount: unreadCount || 0
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

        await Notification.findOneAndUpdate(
            { _id: notificationId, user_id: req.user.id },
            { is_read: true }
        );

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

        await Notification.updateMany(
            { user_id: req.user.id, user_type: userType },
            { is_read: true }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
