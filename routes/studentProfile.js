const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Get student profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { data: student, error } = await supabase
      .from('students')
      .select('id, username, full_name, email, phone_number, trade, institution_id, date_of_birth, address, emergency_contact, status, created_at')
      .eq('id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Student not found' });
      throw error;
    }

    // Map phone_number to phone for frontend consistency
    const formattedStudent = {
      ...student,
      phone: student.phone_number
    };

    res.json({ success: true, student: formattedStudent });
  } catch (error) {
    console.error('Get student profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update student profile
router.put('/profile',
  authenticateToken,
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email address'),
    body('phone').optional({ checkFalsy: true }).isLength({ min: 7, max: 20 }).withMessage('Invalid phone number'),
    body('date_of_birth').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date format'),
    body('address').optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage('Address too long'),
    body('emergency_contact').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('Emergency contact too long'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      if (!req.user || req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const {
        full_name,
        email,
        phone,
        date_of_birth,
        address,
        emergency_contact
      } = req.body;

      // Check if email is already taken by another student
      if (email) {
        const { data: existing, error: checkError } = await supabase
          .from('students')
          .select('id')
          .eq('email', email)
          .neq('id', req.user.id)
          .maybeSingle();

        if (checkError) throw checkError;
        if (existing) {
          return res.status(400).json({ success: false, message: 'Email already in use' });
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('students')
        .update({
          full_name,
          email: email || null,
          phone_number: phone || null,
          date_of_birth: date_of_birth || null,
          address: address || null,
          emergency_contact: emergency_contact || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', req.user.id)
        .select('id, username, full_name, email, phone_number, trade, institution_id, date_of_birth, address, emergency_contact, status, updated_at')
        .single();

      if (updateError) throw updateError;

      res.json({
        success: true,
        message: 'Profile updated successfully',
        student: {
          ...updated,
          phone: updated.phone_number
        }
      });
    } catch (error) {
      console.error('Update student profile error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// Change password
router.put('/password',
  authenticateToken,
  [
    body('current_password').notEmpty().withMessage('Current password is required'),
    body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    body('confirm_password').custom((value, { req }) => {
      if (value !== req.body.new_password) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      if (!req.user || req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const { current_password, new_password } = req.body;

      // Get current password hash
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select('password')
        .eq('id', req.user.id)
        .single();

      if (fetchError) throw fetchError;

      const isMatch = await bcrypt.compare(current_password, student.password);

      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      // Update password
      const { error: updateError } = await supabase
        .from('students')
        .update({
          password: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', req.user.id);

      if (updateError) throw updateError;

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// Get student statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const studentId = req.user.id;

    // Get exam statistics
    const { data: results, error: resError } = await supabase
      .from('results')
      .select('score')
      .eq('student_id', studentId);

    if (resError) throw resError;

    const total_exams = results.length;
    const passed_exams = results.filter(r => r.score >= 50).length;
    const scores = results.map(r => r.score);
    const average_score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highest_score = scores.length ? Math.max(...scores) : 0;
    const lowest_score = scores.length ? Math.min(...scores) : 0;

    // Get recent activity (exams and assignments)
    const { data: recentExams, error: revError } = await supabase
      .from('results')
      .select('score, submitted_at, exam:exams(title, total_marks)')
      .eq('student_id', studentId)
      .order('submitted_at', { ascending: false })
      .limit(10);

    if (revError) throw revError;

    // Note: assignments table might not exist or be different, but keeping consistency with original logic
    const { data: recentAssignments, error: assError } = await supabase
      .from('assignments')
      .select('title, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10);

    // If assignments table doesn't exist, we'll just have empty array
    const assignments = recentAssignments || [];

    const activity = [
      ...recentExams.map(r => ({
        type: 'exam',
        title: r.exam?.title,
        score: r.score,
        total_marks: r.exam?.total_marks,
        date: r.submitted_at
      })),
      ...assignments.map(a => ({
        type: 'assignment',
        title: a.title,
        score: null,
        total_marks: null,
        date: a.created_at
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    // Get upcoming exams
    const { data: upcomingExams, error: upError } = await supabase
      .from('exams') // Assuming 'exams' is used for online exams too
      .select('id, title, description, total_marks, created_at')
      .filter('trade', 'eq', req.user.trade)
      .order('created_at', { ascending: true })
      .limit(5);

    if (upError) throw upError;

    res.json({
      success: true,
      stats: {
        exams: {
          total_exams,
          passed_exams,
          average_score,
          highest_score,
          lowest_score
        },
        recentActivity: activity,
        upcomingExams: upcomingExams || []
      }
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
