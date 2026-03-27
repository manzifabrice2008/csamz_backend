const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Question = require('../models/Question');
const StudentAnswer = require('../models/StudentAnswer');
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

const getGrade = (score, totalMarks) => {
  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

  if (totalMarks > 0 && score >= totalMarks) return 'Pass';
  if (percentage > 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 50) return 'C';
  return 'Fail';
};

const getRankedRows = (rows) => {
  return [...rows].sort((a, b) => {
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.submitted_at || a.createdAt || 0).getTime() - new Date(b.submitted_at || b.createdAt || 0).getTime();
  });
};

router.get('/history', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const studentId = req.user.id;

    const results = await Result.find({ student_id: studentId })
      .populate('exam_id', 'title total_marks trade level')
      .sort({ submitted_at: -1 })
      .lean();

    const examIds = [...new Set(results.map((row) => String(row.exam_id?._id)).filter(Boolean))];
    const examResultRows = await Result.find({ exam_id: { $in: examIds } })
      .populate('student_id', 'trade level')
      .populate('exam_id', 'total_marks trade level')
      .select('student_id exam_id score submitted_at createdAt')
      .lean();

    const ranksByResultId = new Map();

    examIds.forEach((examId) => {
      const relatedRows = examResultRows
        .filter((row) => String(row.exam_id?._id || row.exam_id) === examId)
        .filter((row) => {
          const examTrade = row.exam_id?.trade;
          const examLevel = row.exam_id?.level;
          return row.student_id?.trade === examTrade && row.student_id?.level === examLevel;
        })
        .map((row) => {
          const totalMarks = row.exam_id?.total_marks || 0;
          const percentage = totalMarks > 0 ? Math.round((row.score / totalMarks) * 100) : 0;
          return { ...row, percentage };
        });

      getRankedRows(relatedRows).forEach((row, index) => {
        ranksByResultId.set(String(row._id), index + 1);
      });
    });

    const formattedResults = results.map((row) => {
      const total_marks = row.exam_id?.total_marks || 0;
      const percentage = total_marks > 0 ? (row.score / total_marks) * 100 : 0;
      return {
        id: row._id,
        examId: row.exam_id?._id,
        examTitle: row.exam_id?.title || 'Unknown Exam',
        score: row.score,
        totalMarks: total_marks,
        percentage: Math.round(percentage),
        grade: getGrade(row.score, total_marks),
        rank: ranksByResultId.get(String(row._id)) || null,
        trade: row.exam_id?.trade || null,
        level: row.exam_id?.level || null,
        submittedAt: row.submitted_at || row.createdAt
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
    const studentId = req.params.studentId;
    const examId = req.params.examId;

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const isStudentViewer = req.user.role === 'student' && String(req.user.id) === String(studentId);
    const isStaffViewer = STAFF_ROLES.has(req.user.role) || req.user.role === 'teacher';

    if (!isStudentViewer && !isStaffViewer) {
      return res.status(403).json({ success: false, message: 'Access denied for this result' });
    }

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const result = await Result.findOne({ student_id: studentId, exam_id: examId }).select('score submitted_at createdAt').lean();
    if (!result) {
      return res.status(404).json({ success: false, message: 'Result not found for this student' });
    }

    const questions = await Question.find({ exam_id: examId }).sort({ _id: 1 }).lean();
    const questionIds = questions.map(q => q._id);

    const studentAnswers = await StudentAnswer.find({ 
      student_id: studentId, 
      question_id: { $in: questionIds } 
    }).lean();

    const studentAnswerMap = new Map();
    studentAnswers.forEach(sa => {
      studentAnswerMap.set(String(sa.question_id), sa);
    });

    const formattedAnswers = questions.map((row) => {
      const sa = studentAnswerMap.get(String(row._id)) || {};
      return {
        questionId: row._id,
        questionText: row.question_text,
        type: row.type,
        options: row.type === 'TF' ? ['True', 'False'] : safeParseOptions(row.options, []),
        studentAnswer: sa.answer,
        correctAnswer: row.correct_answer,
        isCorrect: Boolean(sa.is_correct),
        marks: row.marks,
        marksAwarded: sa.is_correct ? row.marks : 0,
      };
    });

    const totalMarks =
      exam.total_marks && exam.total_marks > 0
        ? exam.total_marks
        : formattedAnswers.reduce((sum, row) => sum + (row.marks || 0), 0);

    const percentage = totalMarks > 0 ? (result.score / totalMarks) * 100 : 0;
    const examResults = await Result.find({ exam_id: examId })
      .populate('student_id', 'full_name username trade level')
      .select('student_id score submitted_at createdAt')
      .lean();

    const rankedClassResults = getRankedRows(
      examResults
        .filter((row) => row.student_id?.trade === exam.trade && row.student_id?.level === exam.level)
        .map((row) => ({
          ...row,
          percentage: totalMarks > 0 ? Math.round((row.score / totalMarks) * 100) : 0,
        }))
    );

    const rank = rankedClassResults.findIndex((row) => String(row.student_id?._id || row.student_id) === String(studentId)) + 1;
    const ranking = rankedClassResults.map((row, index) => ({
      rank: index + 1,
      student_id: row.student_id?._id || row.student_id,
      full_name: row.student_id?.full_name || 'Student',
      username: row.student_id?.username || '',
      score: row.score,
      total_marks: totalMarks,
      percentage: row.percentage,
      submitted_at: row.submitted_at || row.createdAt,
    }));

    res.json({
      success: true,
      exam: {
        id: exam._id,
        title: exam.title,
        description: exam.description,
        total_marks: totalMarks,
      },
      result: {
        student_id: studentId,
        exam_id: examId,
        score: result.score,
        total_marks: totalMarks,
        percentage: Math.round(percentage),
        grade: getGrade(result.score, totalMarks),
        rank: rank || null,
        submitted_at: result.submitted_at || result.createdAt,
      },
      ranking,
      answers: formattedAnswers,
    });
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ success: false, message: 'Failed to load result' });
  }
});

module.exports = router;
