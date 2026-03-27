const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const StudentAnswer = require('../models/StudentAnswer');
const Teacher = require('../models/Teacher');
const { authenticateToken } = require('../middleware/auth');
const { getTeacherTrades, getTeacherLevels } = require('../utils/teacherAssignments');
const Student = require('../models/Student');
const { normalizeTradeValue, normalizeLevelValue } = require('../utils/studentClassification');

const STAFF_ROLES = new Set(['admin', 'super_admin']);

const isStaffUser = (user) => {
  if (!user || !user.role) return false;
  return STAFF_ROLES.has(user.role) || user.role === 'teacher';
};

const ensureStaff = (req, res, next) => {
  if (!isStaffUser(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only teachers or admins can perform this action',
    });
  }
  next();
};

const safeParseOptions = (value, fallback = []) => {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
};

const generateExamCode = () => {
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `EX-${timestamp}-${randomPart}`;
};

const normalizeQuestion = (row, includeAnswer = true) => ({
  id: row._id,
  question_text: row.question_text,
  type: row.type,
  options: row.type === 'TF' ? ['True', 'False'] : safeParseOptions(row.options, []),
  correct_answer: includeAnswer ? row.correct_answer : undefined,
  marks: row.marks,
  time_limit: row.time_limit || 30,
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { teacherId } = req.query;

    const query = {};
    if (req.user?.role === 'teacher') {
      query.teacher_id = req.user.id;
    } else if (req.user?.role === 'student') {
      const student = await Student.findById(req.user.id).select('trade level').lean();
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      query.trade = normalizeTradeValue(student.trade);
      query.level = normalizeLevelValue(student.level);
    } else if (teacherId) {
      query.teacher_id = teacherId;
    }

    const exams = await Exam.find(query).sort({ createdAt: -1 }).lean();
    
    // Get all questions to calculate question_count
    const examIds = exams.map(e => e._id);
    const questions = await Question.find({ exam_id: { $in: examIds } }).select('exam_id').lean();
    
    // Get all results if student to check already_taken
    let studentResults = [];
    if (req.user && req.user.role === 'student') {
      studentResults = await Result.find({ student_id: req.user.id, exam_id: { $in: examIds } }).select('exam_id').lean();
    }
    const studentResultExamIds = new Set(studentResults.map(r => String(r.exam_id)));

    const formattedExams = exams.map((e) => {
      const qCount = questions.filter(q => String(q.exam_id) === String(e._id)).length;
      let already_taken = false;

      if (req.user && req.user.role === 'student') {
        already_taken = studentResultExamIds.has(String(e._id));
      }

      return {
        id: e._id,
        ...e,
        question_count: qCount,
        already_taken,
        created_at: e.createdAt,
        updated_at: e.updatedAt
      };
    });

    res.json({
      success: true,
      exams: formattedExams,
    });
  } catch (error) {
    console.error('List exams error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load exams',
    });
  }
});

router.post(
  '/',
  authenticateToken,
  ensureStaff,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().isString(),
    body('total_marks').optional().isInt({ min: 0 }).toInt(),
    body('exam_code').optional().trim().isLength({ min: 3, max: 20 }).withMessage('Exam code must be 3-20 characters'),
    body('level').isIn(['L1', 'L2', 'L3', 'L4', 'L5']).withMessage('Invalid level'),
    body('trade').trim().notEmpty().withMessage('Trade is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { title, description, total_marks = 0, exam_code, level, trade } = req.body;
      const teacherId = req.user.id;

      if (req.user?.role === 'teacher') {
        const teacher = await Teacher.findById(teacherId).select('trade trades level levels').lean();
        if (!teacher) throw new Error('Teacher not found');
        if (!getTeacherTrades(teacher).includes(trade) || !getTeacherLevels(teacher).includes(level)) {
          return res.status(403).json({
            success: false,
            message: 'You can only create exams for your assigned trades and classes'
          });
        }
      }

      let finalExamCode = exam_code?.toUpperCase() || null;

      if (finalExamCode) {
        const existing = await Exam.findOne({ exam_code: finalExamCode }).select('_id').lean();
        if (existing) {
          return res.status(400).json({ success: false, message: 'Exam code already in use' });
        }
      } else {
        let unique = false;
        while (!unique) {
          finalExamCode = generateExamCode();
          const existing = await Exam.findOne({ exam_code: finalExamCode }).select('_id').lean();
          if (!existing) unique = true;
        }
      }

      const result = await Exam.create({
        title,
        exam_code: finalExamCode,
        description: description || null,
        total_marks,
        teacher_id: teacherId,
        trade,
        level
      });

      res.status(201).json({
        success: true,
        message: 'Exam created successfully',
        exam: { id: result._id, ...result.toObject(), created_at: result.createdAt, updated_at: result.updatedAt },
      });
    } catch (error) {
      console.error('Create exam error:', error);
      res.status(500).json({ success: false, message: 'Failed to create exam' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  ensureStaff,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().isString(),
    body('total_marks').optional().isInt({ min: 0 }).toInt(),
    body('level').isIn(['L1', 'L2', 'L3', 'L4', 'L5']).withMessage('Invalid level'),
    body('trade').trim().notEmpty().withMessage('Trade is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const examId = req.params.id;
      const { title, description, total_marks = 0, level, trade } = req.body;

      const existingExam = await Exam.findById(examId).lean();
      if (!existingExam) {
        return res.status(404).json({ success: false, message: 'Exam not found' });
      }

      if (req.user?.role === 'teacher') {
        if (String(existingExam.teacher_id) !== String(req.user.id)) {
          return res.status(403).json({ success: false, message: 'You can only update your own exams' });
        }

        const teacher = await Teacher.findById(req.user.id).select('trade trades level levels').lean();
        if (teacher && (!getTeacherTrades(teacher).includes(trade) || !getTeacherLevels(teacher).includes(level))) {
          return res.status(403).json({
            success: false,
            message: 'You can only assign exams to your own trades and classes'
          });
        }
      }

      const updated = await Exam.findByIdAndUpdate(examId, {
        title,
        description: description || null,
        total_marks,
        trade,
        level
      }, { new: true }).lean();

      res.json({
        success: true,
        message: 'Exam updated successfully',
        exam: { id: updated._id, ...updated, created_at: updated.createdAt, updated_at: updated.updatedAt },
      });
    } catch (error) {
      console.error('Update exam error:', error);
      res.status(500).json({ success: false, message: 'Failed to update exam' });
    }
  }
);

router.delete('/:id', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const examId = req.params.id;

    const existing = await Exam.findById(examId).select('teacher_id').lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (req.user?.role === 'teacher' && String(existing.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only delete your own exams' });
    }

    await Exam.findByIdAndDelete(examId);

    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete exam' });
  }
});

router.get('/:id/questions', authenticateToken, async (req, res) => {
  try {
    const examId = req.params.id;

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (req.user?.role === 'student') {
      const student = await Student.findById(req.user.id).select('trade level').lean();
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const studentTrade = normalizeTradeValue(student.trade);
      const studentLevel = normalizeLevelValue(student.level);

      if (normalizeTradeValue(exam.trade) !== studentTrade || normalizeLevelValue(exam.level) !== studentLevel) {
        return res.status(403).json({
          success: false,
          message: 'This exam is not assigned to your trade and class',
        });
      }
    }

    const questionRows = await Question.find({ exam_id: examId }).sort({ _id: 1 }).lean();

    const questions = questionRows.map((row) => normalizeQuestion(row, false));
    const totalMarks =
      exam.total_marks && exam.total_marks > 0
        ? exam.total_marks
        : questionRows.reduce((sum, q) => sum + (q.marks || 0), 0);

    let already_taken = false;
    if (req.user && req.user.role === 'student') {
      const result = await Result.findOne({ student_id: req.user.id, exam_id: examId }).select('_id').lean();
      if (result) already_taken = true;
    }

    res.json({
      success: true,
      exam: {
        id: exam._id,
        ...exam,
        total_marks: totalMarks,
        already_taken,
        created_at: exam.createdAt,
        updated_at: exam.updatedAt
      },
      questions,
    });
  } catch (error) {
    console.error('Get exam questions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load questions' });
  }
});

router.get('/:id/manage', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const examId = req.params.id;

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (req.user?.role === 'teacher' && String(exam.teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only manage your own exams' });
    }

    const questionRows = await Question.find({ exam_id: examId }).sort({ _id: 1 }).lean();
    const questions = questionRows.map((row) => normalizeQuestion(row, true));

    res.json({
      success: true,
      exam: { id: exam._id, ...exam, created_at: exam.createdAt, updated_at: exam.updatedAt },
      questions,
    });
  } catch (error) {
    console.error('Manage exam load error:', error);
    res.status(500).json({ success: false, message: 'Failed to load exam' });
  }
});

router.post(
  '/:id/questions',
  authenticateToken,
  ensureStaff,
  [
    body('question_text').trim().notEmpty().withMessage('Question text is required'),
    body('type').isIn(['MCQ', 'TF']).withMessage('Type must be MCQ or TF'),
    body('options')
      .optional()
      .custom((value, { req }) => {
        if (req.body.type === 'TF') return true;
        return Array.isArray(value) && value.length >= 2;
      })
      .withMessage('MCQ questions require at least two options'),
    body('correct_answer').trim().notEmpty().withMessage('Correct answer is required'),
    body('marks').isInt({ min: 1 }).withMessage('Marks must be at least 1'),
    body('time_limit').optional().isInt({ min: 5 }).withMessage('Time limit must be at least 5 seconds'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const examId = req.params.id;
      const { question_text, type, options, correct_answer, marks, time_limit = 30 } = req.body;

      const data = await Question.create({
        exam_id: examId,
        question_text,
        type,
        options: type === 'MCQ' ? (typeof options === 'string' ? options : JSON.stringify(options)) : null,
        correct_answer,
        marks,
        time_limit
      });

      res.status(201).json({
        success: true,
        message: 'Question added successfully',
        question: normalizeQuestion(data.toObject(), true),
      });
    } catch (error) {
      console.error('Add question error:', error);
      res.status(500).json({ success: false, message: 'Failed to add question' });
    }
  }
);

router.put(
  '/questions/:questionId',
  authenticateToken,
  ensureStaff,
  [
    body('question_text').optional().trim().notEmpty(),
    body('type').optional().isIn(['MCQ', 'TF']),
    body('time_limit').optional().isInt({ min: 5 }),
    body('options')
      .optional()
      .custom((value, { req }) => {
        if (req.body.type === 'TF') return true;
        return Array.isArray(value) ? value.length >= 2 : true;
      }),
    body('marks').optional().isInt({ min: 1 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const questionId = req.params.questionId;

      const existing = await Question.findById(questionId).lean();
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Question not found' });
      }

      const type = req.body.type || existing.type;
      const updatedData = {
        question_text: req.body.question_text || existing.question_text,
        type,
        correct_answer: req.body.correct_answer || existing.correct_answer,
        marks: req.body.marks || existing.marks,
        time_limit: req.body.time_limit || existing.time_limit,
        options: type === 'MCQ' ? (req.body.options ? JSON.stringify(req.body.options) : existing.options) : null
      };

      const updated = await Question.findByIdAndUpdate(questionId, updatedData, { new: true }).lean();

      res.json({
        success: true,
        message: 'Question updated successfully',
        question: normalizeQuestion(updated, true),
      });
    } catch (error) {
      console.error('Update question error:', error);
      res.status(500).json({ success: false, message: 'Failed to update question' });
    }
  }
);

router.delete('/questions/:questionId', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const deleted = await Question.findByIdAndDelete(req.params.questionId);
    if (!deleted) return res.status(404).json({ success: false, message: 'Question not found' });

    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete question' });
  }
});

router.post(
  '/:id/submit',
  authenticateToken,
  [
    body('answers').isArray().withMessage('Answers must be an array'),
    body('answers.*.questionId').notEmpty().withMessage('Question id is required'),
    body('answers.*.answer').not().isEmpty().withMessage('Answer value is required'),
  ],
  async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can submit answers' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const examId = req.params.id;
      const studentId = req.user.id;
      const answersPayload = req.body.answers;

      const existingResult = await Result.findOne({ student_id: studentId, exam_id: examId }).select('_id').lean();
      if (existingResult) {
        return res.status(400).json({
          success: false,
          message: 'You have already submitted this exam and cannot retake it.'
        });
      }

      const exam = await Exam.findById(examId).lean();
      if (!exam) throw new Error('Exam not found');

      const questions = await Question.find({ exam_id: examId }).lean();
      if (!questions.length) return res.status(400).json({ success: false, message: 'No questions for this exam' });

      const answerMap = new Map();
      answersPayload.forEach((item) => answerMap.set(String(item.questionId), String(item.answer).trim()));

      let score = 0;
      const feedback = [];
      const studentAnswersToInsert = [];

      for (const q of questions) {
        const providedAnswer = answerMap.get(String(q._id)) ?? null;
        const isCorrect = providedAnswer !== null && providedAnswer.toLowerCase() === String(q.correct_answer).toLowerCase();
        if (isCorrect) score += q.marks;

        feedback.push({
          questionId: q._id,
          questionText: q.question_text,
          studentAnswer: providedAnswer,
          correctAnswer: q.correct_answer,
          isCorrect,
          marks: q.marks,
          marksAwarded: isCorrect ? q.marks : 0,
        });

        if (providedAnswer !== null) {
          studentAnswersToInsert.push({
            student_id: studentId,
            question_id: q._id,
            answer: providedAnswer,
            is_correct: isCorrect
          });
        }
      }

      const questionIds = questions.map(q => q._id);
      await StudentAnswer.deleteMany({ student_id: studentId, question_id: { $in: questionIds } });
      
      if (studentAnswersToInsert.length) {
        await StudentAnswer.insertMany(studentAnswersToInsert);
      }

      await Result.create({
        student_id: studentId,
        exam_id: examId,
        score,
        submitted_at: new Date()
      });

      const totalMarks = exam.total_marks || questions.reduce((sum, q) => sum + (q.marks || 0), 0);
      const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

      let grade = 'Fail';
      if (percentage > 80) grade = 'A';
      else if (percentage >= 70) grade = 'B';
      else if (percentage >= 50) grade = 'C';

      res.json({
        success: true,
        message: 'Exam submitted successfully',
        score,
        total_marks: totalMarks,
        percentage: Math.round(percentage),
        grade,
        feedback,
      });
    } catch (error) {
      console.error('Submit exam error:', error);
      res.status(500).json({ success: false, message: 'Failed to submit answers' });
    }
  }
);

router.get('/:id/results', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const examId = req.params.id;

    const exam = await Exam.findById(examId).lean();
    if (!exam) throw new Error('Exam not found');

    const results = await Result.find({ exam_id: examId })
      .populate('student_id', 'full_name username')
      .sort({ submitted_at: -1 })
      .lean();

    let totalMarks = exam.total_marks;
    if (!totalMarks) {
      const qMarks = await Question.find({ exam_id: examId }).select('marks').lean();
      totalMarks = qMarks.reduce((sum, q) => sum + (q.marks || 0), 0);
    }

    const resultsWithGrades = results.map(row => {
      const percentage = totalMarks > 0 ? (row.score / totalMarks) * 100 : 0;
      let grade = 'Fail';
      if (percentage > 80) grade = 'A';
      else if (percentage >= 70) grade = 'B';
      else if (percentage >= 50) grade = 'C';

      return {
        id: row._id,
        student_id: row.student_id?._id,
        full_name: row.student_id?.full_name,
        username: row.student_id?.username,
        score: row.score,
        submitted_at: row.submitted_at || row.createdAt,
        total_marks: totalMarks,
        percentage: Math.round(percentage),
        grade
      };
    });

    const totalSubmissions = resultsWithGrades.length;
    const passCount = resultsWithGrades.filter(r => r.percentage >= 50).length;
    const failCount = totalSubmissions - passCount;
    const winningRate = totalSubmissions > 0 ? Math.round((passCount / totalSubmissions) * 100) : 0;
    const averageScore = totalSubmissions > 0
      ? Math.round(resultsWithGrades.reduce((sum, r) => sum + r.percentage, 0) / totalSubmissions)
      : 0;

    res.json({
      success: true,
      exam_title: exam.title,
      results: resultsWithGrades,
      stats: {
        total_submissions: totalSubmissions,
        pass_count: passCount,
        fail_count: failCount,
        winning_rate: winningRate,
        average_score: averageScore
      }
    });
  } catch (error) {
    console.error('List exam results error:', error);
    res.status(500).json({ success: false, message: 'Failed to load results' });
  }
});

module.exports = router;
