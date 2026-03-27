const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const Result = require('../models/Result');
const Assignment = require('../models/Assignment');
const Exam = require('../models/Exam');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('../middleware/auth');
const { normalizeTradeValue, normalizeLevelValue, normalizeStudentRecord } = require('../utils/studentClassification');

// Get student profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const student = await Student.findById(req.user.id).lean();

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const normalizedStudent = normalizeStudentRecord(student);
    const formattedStudent = {
      id: normalizedStudent._id,
      ...normalizedStudent,
      phone: normalizedStudent.phone_number
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
    body('trade').optional({ checkFalsy: true }).trim().notEmpty().withMessage('Trade is required'),
    body('level').optional({ checkFalsy: true }).isIn(['L3', 'L4', 'L5']).withMessage('Valid level is required'),
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
        emergency_contact,
        trade,
        level
      } = req.body;

      if (email) {
        const existing = await Student.findOne({ email, _id: { $ne: req.user.id } });
        if (existing) {
          return res.status(400).json({ success: false, message: 'Email already in use' });
        }
      }

      const updated = await Student.findByIdAndUpdate(req.user.id, {
        full_name,
        email: email || null,
        phone_number: phone || null,
        trade: trade ? normalizeTradeValue(trade) : undefined,
        level: level ? normalizeLevelValue(level) : undefined,
        date_of_birth: date_of_birth || null,
        address: address || null,
        emergency_contact: emergency_contact || null
      }, { new: true }).lean();

      const normalizedUpdated = normalizeStudentRecord(updated);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        student: {
          id: normalizedUpdated._id,
          ...normalizedUpdated,
          phone: normalizedUpdated.phone_number
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

      const student = await Student.findById(req.user.id).select('password');

      const isMatch = await bcrypt.compare(current_password, student.password);

      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      await Student.findByIdAndUpdate(req.user.id, { password: hashedPassword });

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

    const results = await Result.find({ student_id: studentId }).lean();
    
    const total_exams = results.length;
    const passed_exams = results.filter(r => r.score >= 50).length;
    const scores = results.map(r => r.score);
    const average_score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highest_score = scores.length ? Math.max(...scores) : 0;
    const lowest_score = scores.length ? Math.min(...scores) : 0;

    const recentExams = await Result.find({ student_id: studentId })
      .sort({ submitted_at: -1 })
      .limit(10)
      .populate('exam_id', 'title total_marks')
      .lean();

    const recentAssignments = await Assignment.find({ /* no student_id link directly unless we check submissions, logic matches old style */ })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const activity = [
      ...recentExams.map(r => ({
        type: 'exam',
        title: r.exam_id?.title,
        score: r.score,
        total_marks: r.exam_id?.total_marks,
        date: r.submitted_at
      })),
      ...recentAssignments.map(a => ({
        type: 'assignment',
        title: a.title,
        score: null,
        total_marks: null,
        date: a.createdAt
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    const upcomingExams = await Exam.find({ trade: req.user.trade })
      .select('_id title description total_marks createdAt')
      .sort({ createdAt: 1 })
      .limit(5)
      .lean();

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
        upcomingExams: upcomingExams.map(e => ({ id: e._id, title: e.title, description: e.description, total_marks: e.total_marks, created_at: e.createdAt }))
      }
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
