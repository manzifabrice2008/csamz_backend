const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const STAFF_ROLES = new Set(['admin', 'super_admin']);

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

const getGrade = (percentage) => {
  if (percentage > 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 50) return 'C';
  return 'Fail';
};

router.get('/history', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const studentId = req.user.id;

    const [results] = await db.query(
      `SELECT r.id, r.exam_id, r.score, r.submitted_at, e.title, e.total_marks
       FROM results r
       JOIN exams e ON r.exam_id = e.id
       WHERE r.student_id = ?
       ORDER BY r.submitted_at DESC`,
      [studentId]
    );

    const formattedResults = results.map(row => {
      const percentage = row.total_marks > 0 ? (row.score / row.total_marks) * 100 : 0;
      return {
        id: row.id,
        examId: row.exam_id,
        examTitle: row.title,
        score: row.score,
        totalMarks: row.total_marks,
        percentage: Math.round(percentage),
        grade: getGrade(percentage),
        submittedAt: row.submitted_at
      };
    });

    res.json({ success: true, results: formattedResults });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ success: false, message: 'Failed to load result history' });
  }
});

router.get('/:studentId/:examId', authenticateToken, async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const examId = Number(req.params.examId);

    if (Number.isNaN(studentId) || Number.isNaN(examId)) {
      return res.status(400).json({ success: false, message: 'Invalid identifiers supplied' });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const isStudentViewer = req.user.role === 'student' && req.user.id === studentId;
    const isStaffViewer = STAFF_ROLES.has(req.user.role) || req.user.role === 'teacher';

    if (!isStudentViewer && !isStaffViewer) {
      return res.status(403).json({ success: false, message: 'Access denied for this result' });
    }

    const [[exam]] = await db.query('SELECT * FROM exams WHERE id = ? LIMIT 1', [examId]);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [resultRows] = await db.query(
      'SELECT score, submitted_at FROM results WHERE student_id = ? AND exam_id = ? LIMIT 1',
      [studentId, examId]
    );

    if (resultRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Result not found for this student' });
    }

    const result = resultRows[0];

    const [answers] = await db.query(
      `SELECT q.id AS question_id,
              q.question_text,
              q.type,
              q.options,
              q.correct_answer,
              q.marks,
              sa.answer AS student_answer,
              sa.is_correct
       FROM questions q
       LEFT JOIN student_answers sa ON sa.question_id = q.id AND sa.student_id = ?
       WHERE q.exam_id = ?
       ORDER BY q.id`,
      [studentId, examId]
    );

    const formattedAnswers = answers.map((row) => ({
      questionId: row.question_id,
      questionText: row.question_text,
      type: row.type,
      options: row.type === 'TF' ? ['True', 'False'] : safeParseOptions(row.options, []),
      studentAnswer: row.student_answer,
      correctAnswer: row.correct_answer,
      isCorrect: Boolean(row.is_correct),
      marks: row.marks,
      marksAwarded: row.is_correct ? row.marks : 0,
    }));

    const totalMarks =
      exam.total_marks && exam.total_marks > 0
        ? exam.total_marks
        : formattedAnswers.reduce((sum, row) => sum + (row.marks || 0), 0);

    res.json({
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        total_marks: totalMarks,
      },
      result: {
        student_id: studentId,
        exam_id: examId,
        score: result.score,
        total_marks: totalMarks,
        percentage: Math.round(totalMarks > 0 ? (result.score / totalMarks) * 100 : 0),
        grade: (() => {
          const p = totalMarks > 0 ? (result.score / totalMarks) * 100 : 0;
          if (p > 80) return 'A';
          if (p >= 70) return 'B';
          if (p >= 50) return 'C';
          return 'Fail';
        })(),
        submitted_at: result.submitted_at,
      },
      answers: formattedAnswers,
    });
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ success: false, message: 'Failed to load result' });
  }
});

module.exports = router;

