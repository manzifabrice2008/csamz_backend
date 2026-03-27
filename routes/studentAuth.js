const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const { authenticateToken } = require('../middleware/auth');
const { normalizeTradeValue, normalizeLevelValue, normalizeStudentRecord } = require('../utils/studentClassification');
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
    body('level').isIn(['L3', 'L4', 'L5']).withMessage('Valid level is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { username, password, full_name, email, phone_number } = req.body;
      const trade = normalizeTradeValue(req.body.trade);
      const level = normalizeLevelValue(req.body.level);

      const orQuery = [{ username }];
      if (email) orQuery.push({ email });

      const existing = await Student.findOne({ $or: orQuery });

      if (existing) {
        return res.status(400).json({ success: false, message: 'Username or email already in use' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const result = await Student.create({
        username,
        password: hashedPassword,
        full_name,
        email: email || undefined,
        phone_number,
        trade,
        level,
      });

      const token = jwt.sign(
        { id: result._id, role: 'student', username, full_name, trade, level },
        process.env.JWT_SECRET,
        { expiresIn: STUDENT_JWT_EXPIRY }
      );

      res.status(201).json({
        success: true,
        message: 'Student registered successfully',
        token,
        student: {
          id: result._id,
          username,
          full_name,
          email: result.email || null,
          phone_number,
          trade,
          level,
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
      const student = await Student.findOne({ username });

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
        {
          id: student._id,
          role: 'student',
          username: student.username,
          trade: normalizeTradeValue(student.trade),
          level: normalizeLevelValue(student.level),
        },
        process.env.JWT_SECRET,
        { expiresIn: STUDENT_JWT_EXPIRY }
      );

      const normalizedStudent = normalizeStudentRecord(student.toObject());

      res.json({
        success: true,
        message: 'Login successful',
        token,
        student: {
          id: normalizedStudent._id,
          username: normalizedStudent.username,
          full_name: normalizedStudent.full_name,
          email: normalizedStudent.email,
          phone_number: normalizedStudent.phone_number,
          trade: normalizedStudent.trade,
          level: normalizedStudent.level,
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

    const student = await Student.findById(req.user.id).select('_id username full_name email phone_number status trade level createdAt');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const normalizedStudent = normalizeStudentRecord(student.toObject());

    res.json({ 
      success: true, 
      student: {
        id: normalizedStudent._id,
        username: normalizedStudent.username,
        full_name: normalizedStudent.full_name,
        email: normalizedStudent.email,
        phone_number: normalizedStudent.phone_number,
        status: normalizedStudent.status,
        trade: normalizedStudent.trade,
        level: normalizedStudent.level,
        created_at: student.createdAt
      }
    });
  } catch (error) {
    console.error('Student me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
