const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

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
  id: row.id,
  question_text: row.question_text,
  type: row.type,
  options: row.type === 'TF' ? ['True', 'False'] : safeParseOptions(row.options, []),
  correct_answer: includeAnswer ? row.correct_answer : undefined,
  marks: row.marks,
});

router.get('/', async (req, res) => {
  try {
    const { teacherId } = req.query;
    const filters = [];
    const params = [];

    if (teacherId) {
      filters.push('e.teacher_id = ?');
      params.push(Number(teacherId));
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT e.id, e.title, e.description, e.total_marks, e.teacher_id, e.created_at,
              e.exam_code, e.trade, COUNT(q.id) AS question_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       ${whereClause}
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      params
    );

    res.json({
      success: true,
      exams: rows,
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
      const teacherId = isStaffUser(req.user) ? req.user.id : null;

      // If user is a teacher, ensure they can only create exams for their own trade
      if (req.user?.role === 'teacher') {
        const [teacherRows] = await db.query('SELECT trade FROM teachers WHERE id = ? LIMIT 1', [req.user.id]);
        const teacherTrade = teacherRows.length ? teacherRows[0].trade : null;
        if (teacherTrade && teacherTrade !== trade) {
          return res.status(403).json({
            success: false,
            message: 'You can only create exams for your assigned trade'
          });
        }
      }

      let finalExamCode = exam_code?.toUpperCase() || generateExamCode();

      if (exam_code) {
        const [existingCode] = await db.query('SELECT id FROM exams WHERE exam_code = ? LIMIT 1', [
          exam_code,
        ]);
        if (existingCode.length > 0) {
          return res.status(400).json({ success: false, message: 'Exam code already in use' });
        }
      } else {
        let unique = false;
        while (!unique) {
          const code = generateExamCode();
          const [existingCode] = await db.query('SELECT id FROM exams WHERE exam_code = ? LIMIT 1', [code]);
          if (existingCode.length === 0) {
            finalExamCode = code;
            unique = true;
          }
        }
      }

      const [result] = await db.query(
        'INSERT INTO exams (title, exam_code, description, total_marks, teacher_id, trade, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [title, finalExamCode, description || null, total_marks, teacherId, trade, level]
      );

      res.status(201).json({
        success: true,
        message: 'Exam created successfully',
        exam: {
          id: result.insertId,
          title,
          exam_code: finalExamCode,
          description: description || null,
          total_marks,
          teacher_id: teacherId,
          trade: trade,
          level: level,
        },
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

      const examId = Number(req.params.id);
      if (Number.isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam id' });
      }

      const { title, description, total_marks = 0, level, trade } = req.body;

      // Check existence and ownership/permissions
      const [existingRows] = await db.query('SELECT * FROM exams WHERE id = ? LIMIT 1', [examId]);
      if (existingRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Exam not found' });
      }
      const existingExam = existingRows[0];

      // If user is a teacher, ensure they can only update their own exams
      if (req.user?.role === 'teacher') {
        if (existingExam.teacher_id !== req.user.id) {
          return res.status(403).json({ success: false, message: 'You can only update your own exams' });
        }

        // Also check if they are trying to change trade to something they aren't assigned
        const [teacherRows] = await db.query('SELECT trade FROM teachers WHERE id = ? LIMIT 1', [req.user.id]);
        const teacherTrade = teacherRows.length ? teacherRows[0].trade : null;
        if (teacherTrade && teacherTrade !== trade) {
          return res.status(403).json({
            success: false,
            message: 'You can only assign exams to your own trade'
          });
        }
      }

      await db.query(
        'UPDATE exams SET title = ?, description = ?, total_marks = ?, trade = ?, level = ? WHERE id = ?',
        [title, description || null, total_marks, trade, level, examId]
      );

      res.json({
        success: true,
        message: 'Exam updated successfully',
        exam: {
          ...existingExam,
          title,
          description: description || null,
          total_marks,
          trade,
          level,
        },
      });
    } catch (error) {
      console.error('Update exam error:', error);
      res.status(500).json({ success: false, message: 'Failed to update exam' });
    }
  }
);

router.delete('/:id', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const examId = Number(req.params.id);
    if (Number.isNaN(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid exam id' });
    }

    // Check existence and ownership
    const [existingRows] = await db.query('SELECT teacher_id FROM exams WHERE id = ? LIMIT 1', [examId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (req.user?.role === 'teacher' && existingRows[0].teacher_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own exams' });
    }

    // Delete related questions first (if no cascade)
    await db.query('DELETE FROM questions WHERE exam_id = ?', [examId]);
    // Delete related results/answers if necessary? 
    // Usually we might want to prevent deletion if results exist, but for now we'll allow it or leave it to DB constraints.
    // Assuming simple deletion for now.

    await db.query('DELETE FROM exams WHERE id = ?', [examId]);

    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete exam' });
  }
});

router.get('/:id/questions', async (req, res) => {
  try {
    const examId = Number(req.params.id);
    if (Number.isNaN(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid exam id' });
    }

    const [examRows] = await db.query('SELECT * FROM exams WHERE id = ? LIMIT 1', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const exam = examRows[0];

    const [questionRows] = await db.query(
      'SELECT id, question_text, type, options, correct_answer, marks FROM questions WHERE exam_id = ? ORDER BY id ASC',
      [examId]
    );

    const questions = questionRows.map((row) => normalizeQuestion(row, false));
    const totalMarks =
      exam.total_marks && exam.total_marks > 0
        ? exam.total_marks
        : questionRows.reduce((sum, q) => sum + (q.marks || 0), 0);

    res.json({
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        exam_code: exam.exam_code,
        description: exam.description,
        total_marks: totalMarks,
        trade: exam.trade,
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
    const examId = Number(req.params.id);
    if (Number.isNaN(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid exam id' });
    }

    const [examRows] = await db.query('SELECT * FROM exams WHERE id = ? LIMIT 1', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const exam = examRows[0];
    const [questionRows] = await db.query(
      'SELECT id, question_text, type, options, correct_answer, marks FROM questions WHERE exam_id = ? ORDER BY id ASC',
      [examId]
    );

    const questions = questionRows.map((row) => normalizeQuestion(row, true));

    res.json({
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        exam_code: exam.exam_code,
        total_marks: exam.total_marks,
        trade: exam.trade,
        level: exam.level,
        teacher_name: exam.teacher_name,
      },
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
        if (req.body.type === 'TF') {
          return true;
        }
        return Array.isArray(value) && value.length >= 2;
      })
      .withMessage('MCQ questions require at least two options'),
    body('correct_answer').trim().notEmpty().withMessage('Correct answer is required'),
    body('marks').isInt({ min: 1 }).withMessage('Marks must be at least 1'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const examId = Number(req.params.id);
      if (Number.isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam id' });
      }

      const [examRows] = await db.query('SELECT id FROM exams WHERE id = ? LIMIT 1', [examId]);
      if (examRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Exam not found' });
      }

      const { question_text, type, options, correct_answer, marks } = req.body;
      const optionsValue = type === 'MCQ' ? JSON.stringify(options || []) : null;

      const [result] = await db.query(
        `INSERT INTO questions (exam_id, question_text, type, options, correct_answer, marks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [examId, question_text, type, optionsValue, correct_answer, marks]
      );

      res.status(201).json({
        success: true,
        message: 'Question added successfully',
        question: {
          id: result.insertId,
          exam_id: examId,
          question_text,
          type,
          options: type === 'TF' ? ['True', 'False'] : options || [],
          correct_answer,
          marks,
        },
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
    body('options')
      .optional()
      .custom((value, { req }) => {
        if (req.body.type === 'TF') {
          return true;
        }
        if (req.body.type && req.body.type !== 'MCQ') {
          return true;
        }
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

      const questionId = Number(req.params.questionId);
      if (Number.isNaN(questionId)) {
        return res.status(400).json({ success: false, message: 'Invalid question id' });
      }

      const [rows] = await db.query('SELECT * FROM questions WHERE id = ? LIMIT 1', [questionId]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Question not found' });
      }

      const existing = rows[0];
      const updatedQuestion = {
        question_text: req.body.question_text || existing.question_text,
        type: req.body.type || existing.type,
        correct_answer: req.body.correct_answer || existing.correct_answer,
        marks: req.body.marks || existing.marks,
        options:
          (req.body.type || existing.type) === 'MCQ'
            ? JSON.stringify(req.body.options || safeParseOptions(existing.options, []))
            : null,
      };

      await db.query(
        `UPDATE questions
         SET question_text = ?, type = ?, options = ?, correct_answer = ?, marks = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          updatedQuestion.question_text,
          updatedQuestion.type,
          updatedQuestion.options,
          updatedQuestion.correct_answer,
          updatedQuestion.marks,
          questionId,
        ]
      );

      res.json({
        success: true,
        message: 'Question updated successfully',
        question: {
          id: questionId,
          exam_id: existing.exam_id,
          question_text: updatedQuestion.question_text,
          type: updatedQuestion.type,
          options:
            updatedQuestion.type === 'TF'
              ? ['True', 'False']
              : safeParseOptions(updatedQuestion.options, []),
          correct_answer: updatedQuestion.correct_answer,
          marks: updatedQuestion.marks,
        },
      });
    } catch (error) {
      console.error('Update question error:', error);
      res.status(500).json({ success: false, message: 'Failed to update question' });
    }
  }
);

router.delete('/questions/:questionId', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const questionId = Number(req.params.questionId);
    if (Number.isNaN(questionId)) {
      return res.status(400).json({ success: false, message: 'Invalid question id' });
    }

    const [result] = await db.query('DELETE FROM questions WHERE id = ?', [questionId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

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
    body('answers.*.questionId').isInt({ min: 1 }).withMessage('Question id is required'),
    body('answers.*.answer').not().isEmpty().withMessage('Answer value is required'),
  ],
  async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'student') {
        return res.status(403).json({
          success: false,
          message: 'Only students can submit answers',
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const examId = Number(req.params.id);
      if (Number.isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam id' });
      }

      const studentId = req.user.id;
      const answersPayload = req.body.answers;

      const [examRows] = await db.query('SELECT * FROM exams WHERE id = ? LIMIT 1', [examId]);
      if (examRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Exam not found' });
      }

      const [questionRows] = await db.query(
        'SELECT id, question_text, correct_answer, marks FROM questions WHERE exam_id = ?',
        [examId]
      );

      if (questionRows.length === 0) {
        return res.status(400).json({ success: false, message: 'No questions configured for this exam' });
      }

      const answerMap = new Map();
      answersPayload.forEach((item) => {
        answerMap.set(Number(item.questionId), String(item.answer).trim());
      });

      let score = 0;
      const feedback = [];

      await db.query(
        `DELETE sa FROM student_answers sa
         INNER JOIN questions q ON q.id = sa.question_id
         WHERE sa.student_id = ? AND q.exam_id = ?`,
        [studentId, examId]
      );

      for (const question of questionRows) {
        const providedAnswer = answerMap.get(question.id) ?? null;
        const isCorrect =
          providedAnswer !== null &&
          providedAnswer.toLowerCase() === String(question.correct_answer).toLowerCase();

        if (isCorrect) {
          score += question.marks;
        }

        feedback.push({
          questionId: question.id,
          questionText: question.question_text,
          studentAnswer: providedAnswer,
          correctAnswer: question.correct_answer,
          isCorrect,
          marks: question.marks,
          marksAwarded: isCorrect ? question.marks : 0,
        });

        if (providedAnswer !== null) {
          await db.query(
            'INSERT INTO student_answers (student_id, question_id, answer, is_correct) VALUES (?, ?, ?, ?)',
            [studentId, question.id, providedAnswer, isCorrect ? 1 : 0]
          );
        }
      }

      await db.query(
        `INSERT INTO results (student_id, exam_id, score)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), submitted_at = CURRENT_TIMESTAMP`,
        [studentId, examId, score]
      );

      const totalMarks =
        examRows[0].total_marks && examRows[0].total_marks > 0
          ? examRows[0].total_marks
          : questionRows.reduce((sum, q) => sum + (q.marks || 0), 0);

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
    const examId = Number(req.params.id);
    if (Number.isNaN(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid exam id' });
    }

    // Get exam details first to calculate grades
    const [examRows] = await db.query('SELECT * FROM exams WHERE id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const exam = examRows[0];

    // If total_marks is not set on exam, calculate from questions
    let totalMarks = exam.total_marks;
    if (!totalMarks || totalMarks === 0) {
      const [questionRows] = await db.query('SELECT SUM(marks) as total FROM questions WHERE exam_id = ?', [examId]);
      totalMarks = questionRows[0].total || 0;
    }

    const [rows] = await db.query(
      `SELECT r.id, r.student_id, s.full_name, s.username, r.score, r.submitted_at
       FROM results r
       INNER JOIN students s ON s.id = r.student_id
       WHERE r.exam_id = ?
       ORDER BY r.submitted_at DESC`,
      [examId]
    );

    const resultsWithGrades = rows.map(row => {
      const percentage = totalMarks > 0 ? (row.score / totalMarks) * 100 : 0;
      let grade = 'Fail';
      if (percentage > 80) grade = 'A';
      else if (percentage >= 70) grade = 'B';
      else if (percentage >= 50) grade = 'C';

      return {
        ...row,
        total_marks: totalMarks,
        percentage: Math.round(percentage),
        grade
      };
    });

    res.json({
      success: true,
      exam_title: exam.title,
      results: resultsWithGrades,
    });
  } catch (error) {
    console.error('List exam results error:', error);
    res.status(500).json({ success: false, message: 'Failed to load results' });
  }
});

module.exports = router;

