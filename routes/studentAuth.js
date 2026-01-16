const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

const STUDENT_JWT_EXPIRY = '30d';

router.post('/register',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email address'),
    body('phone_number')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .isLength({ min: 7, max: 20 })
      .withMessage('Phone number length looks invalid'),
    body('trade').trim().notEmpty().withMessage('Trade is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { username, password, full_name, email, phone_number, trade } = req.body;

      const { data: existing, error: fetchError } = await supabase
        .from('students')
        .select('id')
        .or(`username.eq.${username}${email ? `,email.eq.${email}` : ''}`)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        return res.status(400).json({ success: false, message: 'Username or email already in use' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const { data: result, error: insertError } = await supabase
        .from('students')
        .insert([{
          username,
          password: hashedPassword,
          full_name,
          email: email || null,
          phone_number,
          trade
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      const token = jwt.sign(
        { id: result.id, role: 'student', username, full_name, trade },
        process.env.JWT_SECRET,
        { expiresIn: STUDENT_JWT_EXPIRY }
      );

      res.status(201).json({
        success: true,
        message: 'Student registered successfully',
        token,
        student: {
          id: result.id,
          username,
          full_name,
          email: email || null,
          phone_number,
          trade,
          role: 'student',
        },
      });
    } catch (error) {
      console.error('Student register error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

router.post('/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { username, password } = req.body;
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select('id, username, password, full_name, email, status, trade')
        .eq('username', username)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!student) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (student.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Account is inactive. Contact administrator.' });
      }

      const isMatch = await bcrypt.compare(password, student.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: student.id, role: 'student', username: student.username, trade: student.trade },
        process.env.JWT_SECRET,
        { expiresIn: STUDENT_JWT_EXPIRY }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token,
        student: {
          id: student.id,
          username: student.username,
          full_name: student.full_name,
          email: student.email,
          trade: student.trade,
          role: 'student',
        },
      });
    } catch (error) {
      console.error('Student login error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { data: student, error } = await supabase
      .from('students')
      .select('id, username, full_name, email, status, trade')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, student });
  } catch (error) {
    console.error('Student me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
