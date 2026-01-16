const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Determine user type from auth logic or assume based on role if needed
        // The current auth middleware puts role in req.user
        const userType = req.user.role; // 'student', 'teacher', 'admin'

        // Note: The schema has user_type column. 
        // If your roles map exactly, great. If 'super_admin' maps to 'admin' in notifications, adjust here.
        let dbUserType = userType;
        if (userType === 'super_admin') dbUserType = 'admin';

        const [notifications] = await db.query(
            `SELECT * FROM notifications 
       WHERE user_id = ? AND user_type = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
            [req.user.id, dbUserType]
        );

        // Also get unread count
        const [countRows] = await db.query(
            `SELECT COUNT(*) as unread_count FROM notifications 
         WHERE user_id = ? AND user_type = ? AND is_read = 0`,
            [req.user.id, dbUserType]
        );

        res.json({
            success: true,
            notifications,
            unreadCount: countRows[0].unread_count
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

        await db.query(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [notificationId, req.user.id]
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

        await db.query(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND user_type = ?',
            [req.user.id, userType]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
