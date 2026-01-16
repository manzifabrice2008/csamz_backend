const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
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

    const { data: results, error } = await supabase
      .from('results')
      .select(`
        id,
        exam_id,
        score,
        submitted_at,
        exam:exams (
          title,
          total_marks
        )
      `)
      .eq('student_id', studentId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const formattedResults = results.map(row => {
      const total_marks = row.exam?.total_marks || 0;
      const percentage = total_marks > 0 ? (row.score / total_marks) * 100 : 0;
      return {
        id: row.id,
        examId: row.exam_id,
        examTitle: row.exam?.title || 'Unknown Exam',
        score: row.score,
        totalMarks: total_marks,
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

    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (examError) {
      if (examError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Exam not found' });
      throw examError;
    }

    const { data: result, error: resultError } = await supabase
      .from('results')
      .select('score, submitted_at')
      .eq('student_id', studentId)
      .eq('exam_id', examId)
      .maybeSingle();

    if (resultError) throw resultError;
    if (!result) {
      return res.status(404).json({ success: false, message: 'Result not found for this student' });
    }

    const { data: answers, error: answersError } = await supabase
      .from('questions')
      .select(`
        id,
        question_text,
        type,
        options,
        correct_answer,
        marks,
        student_answers!left (
          answer,
          is_correct
        )
      `)
      .eq('exam_id', examId)
      .eq('student_answers.student_id', studentId)
      .order('id');

    if (answersError) throw answersError;

    const formattedAnswers = answers.map((row) => {
      const sa = row.student_answers?.[0] || {};
      return {
        questionId: row.id,
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
          return getGrade(p);
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

