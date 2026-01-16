const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

const TEACHER_JWT_EXPIRY = '7d';

const isAdminUser = (user) => {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'super_admin';
};

router.post(
  '/register',
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('trade').trim().notEmpty().withMessage('Trade/subject is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { full_name, username, email, password, trade } = req.body;

      const { data: existing, error: fetchError } = await supabase
        .from('teachers')
        .select('id')
        .or(`username.eq.${username},email.eq.${email}`)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Username or email already in use',
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const { data: result, error: insertError } = await supabase
        .from('teachers')
        .insert([{ full_name, username, email, password: hashedPassword, trade, status: 'pending' }])
        .select()
        .single();

      if (insertError) throw insertError;

      res.status(201).json({
        success: true,
        message: 'Registration submitted. An admin must approve your account before you can log in.',
        teacher: {
          id: result.id,
          full_name,
          username,
          email,
          trade,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Teacher register error:', error);
      res.status(500).json({ success: false, message: 'Server error during registration' });
    }
  }
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email, password } = req.body;

      const { data: teacher, error: fetchError } = await supabase
        .from('teachers')
        .select('id, full_name, username, email, password, status')
        .eq('email', email)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!teacher) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (teacher.status !== 'approved') {
        return res.status(403).json({
          success: false,
          message:
            teacher.status === 'pending'
              ? 'Your account is awaiting admin approval.'
              : 'Your account has been rejected. Contact an administrator.',
        });
      }

      const isMatch = await bcrypt.compare(password, teacher.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        {
          id: teacher.id,
          role: 'teacher',
          username: teacher.username,
          email: teacher.email,
          full_name: teacher.full_name,
        },
        process.env.JWT_SECRET,
        { expiresIn: TEACHER_JWT_EXPIRY }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token,
        teacher: {
          id: teacher.id,
          full_name: teacher.full_name,
          username: teacher.username,
          email: teacher.email,
          role: 'teacher',
          status: teacher.status,
        },
      });
    } catch (error) {
      console.error('Teacher login error:', error);
      res.status(500).json({ success: false, message: 'Server error during login' });
    }
  }
);

router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { data: teacher, error } = await supabase
      .from('teachers')
      .select('id, full_name, username, email, status, created_at')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('Teacher me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin-only endpoints to list and approve/reject teachers
router.get('/admin/list', authenticateToken, async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ success: false, message: 'Only admins can view teachers' });
    }

    const { data: teachers, error } = await supabase
      .from('teachers')
      .select('id, full_name, username, email, status, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, teachers });
  } catch (error) {
    console.error('List teachers error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch(
  '/admin/:id/status',
  authenticateToken,
  [body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status')],
  async (req, res) => {
    try {
      if (!isAdminUser(req.user)) {
        return res.status(403).json({ success: false, message: 'Only admins can change teacher status' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const teacherId = req.params.id;
      const { status } = req.body;

      const { error, count } = await supabase
        .from('teachers')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', teacherId);

      if (error) throw error;

      res.json({ success: true, message: `Teacher status updated to ${status}` });
    } catch (error) {
      console.error('Update teacher status error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;


