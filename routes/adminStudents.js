const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Middleware to ensure user is an admin
const ensureAdmin = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
        return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }
    next();
};

// Get all students
router.get('/', authenticateToken, ensureAdmin, async (req, res) => {
    try {
        const { data: students, error } = await supabase
            .from('students')
            .select('id, full_name, username, email, phone_number, trade, level, status, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            students
        });
    } catch (error) {
        console.error('Admin get students error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
});

// Update student status
router.patch('/:id/status', authenticateToken, ensureAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const { data, error } = await supabase
            .from('students')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Student status updated to ${status}`,
            student: data
        });
    } catch (error) {
        console.error('Update student status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update student status' });
    }
});

// Delete student
router.delete('/:id', authenticateToken, ensureAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // First check if student exists
        const { data: student, error: fetchError } = await supabase
            .from('students')
            .select('id')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Delete from students table (cascading deletes should handle related records if configured, 
        // otherwise we might need to delete results, etc manually if no FK cascade is set)
        const { error: deleteError } = await supabase
            .from('students')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({
            success: true,
            message: 'Student deleted successfully'
        });
    } catch (error) {
        console.error('Delete student error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete student' });
    }
});

module.exports = router;
