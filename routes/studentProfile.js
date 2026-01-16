const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get student profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [rows] = await db.query(
      `SELECT id, username, full_name, email, phone_number AS phone, trade, institution_id, 
              date_of_birth, address, emergency_contact, status, created_at 
       FROM students WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, student: rows[0] });
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
        const [existing] = await db.query(
          'SELECT id FROM students WHERE email = ? AND id != ? LIMIT 1',
          [email, req.user.id]
        );

        if (existing.length > 0) {
          return res.status(400).json({ success: false, message: 'Email already in use' });
        }
      }

      const [result] = await db.query(
        `UPDATE students 
         SET full_name = ?, email = ?, phone_number = ?, date_of_birth = ?, 
             address = ?, emergency_contact = ?, updated_at = NOW()
         WHERE id = ?`,
        [full_name, email || null, phone || null, date_of_birth || null,
          address || null, emergency_contact || null, req.user.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      // Get updated student data
      const [updatedRows] = await db.query(
        `SELECT id, username, full_name, email, phone_number AS phone, trade, institution_id, 
                date_of_birth, address, emergency_contact, status, updated_at 
         FROM students WHERE id = ? LIMIT 1`,
        [req.user.id]
      );

      res.json({
        success: true,
        message: 'Profile updated successfully',
        student: updatedRows[0]
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
      const [rows] = await db.query(
        'SELECT password FROM students WHERE id = ? LIMIT 1',
        [req.user.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const bcrypt = require('bcryptjs');
      const isMatch = await bcrypt.compare(current_password, rows[0].password);

      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      // Update password
      await db.query(
        'UPDATE students SET password = ?, updated_at = NOW() WHERE id = ?',
        [hashedPassword, req.user.id]
      );

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

    // Get exam statistics
    const [examStats] = await db.query(
      `SELECT 
         COUNT(*) as total_exams,
         COUNT(CASE WHEN score >= 50 THEN 1 END) as passed_exams,
         AVG(score) as average_score,
         MAX(score) as highest_score,
         MIN(score) as lowest_score
       FROM exam_results 
       WHERE student_id = ?`,
      [req.user.id]
    );

    // Get recent activity
    const [recentActivity] = await db.query(
      `SELECT 
         'exam' as type,
         er.exam_title as title,
         er.score,
         er.total_marks,
         er.created_at as date
       FROM exam_results er
       WHERE er.student_id = ?
       
       UNION ALL
       
       SELECT 
         'assignment' as type,
         title,
         NULL as score,
         NULL as total_marks,
         created_at as date
       FROM assignments
       WHERE student_id = ?
       
       ORDER BY date DESC
       LIMIT 10`,
      [req.user.id, req.user.id]
    );

    // Get upcoming exams
    const [upcomingExams] = await db.query(
      `SELECT id, title, description, total_marks, duration, exam_date, start_time, end_time
       FROM online_exams 
       WHERE exam_date >= CURDATE() 
       AND (trade IS NULL OR LOWER(trade) = LOWER(?))
       ORDER BY exam_date ASC, start_time ASC
       LIMIT 5`,
      [req.user.trade]
    );

    res.json({
      success: true,
      stats: {
        exams: examStats[0] || {
          total_exams: 0,
          passed_exams: 0,
          average_score: 0,
          highest_score: 0,
          lowest_score: 0
        },
        recentActivity,
        upcomingExams
      }
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
