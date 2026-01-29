const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Get all admin users
router.get('/', isAdmin, async (req, res) => {
  try {
    const { data: admins, error } = await supabase
      .from('admins')
      .select('id, username, email, full_name, role, status, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      admins: admins || []
    });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admins' });
  }
});

// Update admin status
router.patch('/:id/status', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const { data: admin, error } = await supabase
      .from('admins')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Admin status updated to ${status}`,
      admin
    });
  } catch (error) {
    console.error('Error updating admin status:', error);
    res.status(500).json({ success: false, message: 'Failed to update admin status' });
  }
});

// Delete admin
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting self
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ success: false, message: 'Failed to delete admin' });
  }
});

module.exports = router;
