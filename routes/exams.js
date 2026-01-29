const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
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
  time_limit: row.time_limit || 30,
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { teacherId } = req.query;

    let query = supabase
      .from('exams')
      .select('*, questions(id)');

    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data: exams, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    const formattedExams = await Promise.all(exams.map(async (e) => {
      let already_taken = false;
      if (req.user && req.user.role === 'student') {
        const { data: result } = await supabase
          .from('results')
          .select('id')
          .eq('student_id', req.user.id)
          .eq('exam_id', e.id)
          .maybeSingle();
        if (result) already_taken = true;
      }

      return {
        ...e,
        question_count: e.questions?.length || 0,
        already_taken
      };
    }));

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

      // If user is a teacher, ensure they can only create exams for their own trade
      if (req.user?.role === 'teacher') {
        const { data: teacher, error: teacherError } = await supabase
          .from('teachers')
          .select('trade')
          .eq('id', teacherId)
          .single();

        if (teacherError) throw teacherError;
        if (teacher.trade !== trade) {
          return res.status(403).json({
            success: false,
            message: 'You can only create exams for your assigned trade'
          });
        }
      }

      let finalExamCode = exam_code?.toUpperCase() || null;

      if (finalExamCode) {
        const { data: existing, error: checkError } = await supabase
          .from('exams')
          .select('id')
          .eq('exam_code', finalExamCode)
          .maybeSingle();

        if (checkError) throw checkError;
        if (existing) {
          return res.status(400).json({ success: false, message: 'Exam code already in use' });
        }
      } else {
        let unique = false;
        while (!unique) {
          finalExamCode = generateExamCode();
          const { data: existing } = await supabase
            .from('exams')
            .select('id')
            .eq('exam_code', finalExamCode)
            .maybeSingle();
          if (!existing) unique = true;
        }
      }

      const { data: result, error: insertError } = await supabase
        .from('exams')
        .insert([{ title, exam_code: finalExamCode, description: description || null, total_marks, teacher_id: teacherId, trade, level }])
        .select()
        .single();

      if (insertError) throw insertError;

      res.status(201).json({
        success: true,
        message: 'Exam created successfully',
        exam: result,
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

      // Check existence and ownership/permissions
      const { data: existingExam, error: fetchError } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Exam not found' });
        throw fetchError;
      }

      // If user is a teacher, ensure they can only update their own exams
      if (req.user?.role === 'teacher') {
        if (existingExam.teacher_id !== req.user.id) {
          return res.status(403).json({ success: false, message: 'You can only update your own exams' });
        }

        const { data: teacher } = await supabase.from('teachers').select('trade').eq('id', req.user.id).single();
        if (teacher && teacher.trade !== trade) {
          return res.status(403).json({
            success: false,
            message: 'You can only assign exams to your own trade'
          });
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('exams')
        .update({
          title,
          description: description || null,
          total_marks,
          trade,
          level,
          updated_at: new Date().toISOString()
        })
        .eq('id', examId)
        .select()
        .single();

      if (updateError) throw updateError;

      res.json({
        success: true,
        message: 'Exam updated successfully',
        exam: updated,
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

    const { data: existing, error: fetchError } = await supabase
      .from('exams')
      .select('teacher_id')
      .eq('id', examId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Exam not found' });
      throw fetchError;
    }

    if (req.user?.role === 'teacher' && existing.teacher_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own exams' });
    }

    const { error: deleteError } = await supabase
      .from('exams')
      .delete()
      .eq('id', examId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete exam' });
  }
});

router.get('/:id/questions', async (req, res) => {
  try {
    const examId = req.params.id;

    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (examError) {
      if (examError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Exam not found' });
      throw examError;
    }

    const { data: questionRows, error: qError } = await supabase
      .from('questions')
      .select('id, question_text, type, options, correct_answer, marks')
      .eq('exam_id', examId)
      .order('id', { ascending: true });

    if (qError) throw qError;

    const questions = questionRows.map((row) => normalizeQuestion(row, false));
    const totalMarks =
      exam.total_marks && exam.total_marks > 0
        ? exam.total_marks
        : questionRows.reduce((sum, q) => sum + (q.marks || 0), 0);

    let already_taken = false;
    if (req.user && req.user.role === 'student') {
      const { data: result } = await supabase
        .from('results')
        .select('id')
        .eq('student_id', req.user.id)
        .eq('exam_id', examId)
        .maybeSingle();
      if (result) already_taken = true;
    }

    res.json({
      success: true,
      exam: {
        ...exam,
        total_marks: totalMarks,
        already_taken,
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

    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (examError) {
      if (examError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Exam not found' });
      throw examError;
    }

    const { data: questionRows, error: qError } = await supabase
      .from('questions')
      .select('id, question_text, type, options, correct_answer, marks, time_limit')
      .eq('exam_id', examId)
      .order('id', { ascending: true });

    if (qError) throw qError;

    const questions = questionRows.map((row) => normalizeQuestion(row, true));

    res.json({
      success: true,
      exam,
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

      const { data, error } = await supabase
        .from('questions')
        .insert([{
          exam_id: examId,
          question_text,
          type,
          options: type === 'MCQ' ? (typeof options === 'string' ? options : JSON.stringify(options)) : null,
          correct_answer,
          marks,
          time_limit
        }])
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'Question added successfully',
        question: normalizeQuestion(data, true),
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

      const { data: existing, error: fetchError } = await supabase
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Question not found' });
        throw fetchError;
      }

      const type = req.body.type || existing.type;
      const updatedData = {
        question_text: req.body.question_text || existing.question_text,
        type,
        correct_answer: req.body.correct_answer || existing.correct_answer,
        marks: req.body.marks || existing.marks,
        time_limit: req.body.time_limit || existing.time_limit,
        options: type === 'MCQ' ? (req.body.options ? JSON.stringify(req.body.options) : existing.options) : null,
        updated_at: new Date().toISOString()
      };

      const { data: updated, error: updateError } = await supabase
        .from('questions')
        .update(updatedData)
        .eq('id', questionId)
        .select()
        .single();

      if (updateError) throw updateError;

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
    const { error, count } = await supabase
      .from('questions')
      .delete({ count: 'exact' })
      .eq('id', req.params.questionId);

    if (error) throw error;
    if (count === 0) return res.status(404).json({ success: false, message: 'Question not found' });

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

      // Check if student already took this exam
      const { data: existingResult } = await supabase
        .from('results')
        .select('id')
        .eq('student_id', studentId)
        .eq('exam_id', examId)
        .maybeSingle();

      if (existingResult) {
        return res.status(400).json({
          success: false,
          message: 'You have already submitted this exam and cannot retake it.'
        });
      }

      const { data: exam, error: examError } = await supabase.from('exams').select('*').eq('id', examId).single();
      if (examError) throw examError;

      const { data: questions, error: qError } = await supabase.from('questions').select('*').eq('exam_id', examId);
      if (qError) throw qError;

      if (!questions.length) return res.status(400).json({ success: false, message: 'No questions for this exam' });

      const answerMap = new Map();
      answersPayload.forEach((item) => answerMap.set(String(item.questionId), String(item.answer).trim()));

      let score = 0;
      const feedback = [];
      const studentAnswersToInsert = [];

      for (const q of questions) {
        const providedAnswer = answerMap.get(String(q.id)) ?? null;
        const isCorrect = providedAnswer !== null && providedAnswer.toLowerCase() === String(q.correct_answer).toLowerCase();
        if (isCorrect) score += q.marks;

        feedback.push({
          questionId: q.id,
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
            question_id: q.id,
            answer: providedAnswer,
            is_correct: isCorrect
          });
        }
      }

      // Cleanup old answers
      await supabase.from('student_answers').delete().eq('student_id', studentId).in('question_id', questions.map(q => q.id));

      // Batch insert new answers
      if (studentAnswersToInsert.length) {
        const { error: batchError } = await supabase.from('student_answers').insert(studentAnswersToInsert);
        if (batchError) throw batchError;
      }

      // Upsert result
      const { error: resultError } = await supabase
        .from('results')
        .upsert({
          student_id: studentId,
          exam_id: examId,
          score,
          submitted_at: new Date().toISOString()
        }, { onConflict: 'student_id,exam_id' });

      if (resultError) throw resultError;

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

    const { data: exam, error: examError } = await supabase.from('exams').select('*').eq('id', examId).single();
    if (examError) throw examError;

    const { data: results, error: resError } = await supabase
      .from('results')
      .select('id, student_id, score, submitted_at, student:students(full_name, username)')
      .eq('exam_id', examId)
      .order('submitted_at', { ascending: false });

    if (resError) throw resError;

    let totalMarks = exam.total_marks;
    if (!totalMarks) {
      const { data: qMarks } = await supabase.from('questions').select('marks').eq('exam_id', examId);
      totalMarks = qMarks.reduce((sum, q) => sum + (q.marks || 0), 0);
    }

    const resultsWithGrades = results.map(row => {
      const percentage = totalMarks > 0 ? (row.score / totalMarks) * 100 : 0;
      let grade = 'Fail';
      if (percentage > 80) grade = 'A';
      else if (percentage >= 70) grade = 'B';
      else if (percentage >= 50) grade = 'C';

      return {
        id: row.id,
        student_id: row.student_id,
        full_name: row.student?.full_name,
        username: row.student?.username,
        score: row.score,
        submitted_at: row.submitted_at,
        total_marks: totalMarks,
        percentage: Math.round(percentage),
        grade
      };
    });

    // Calculate Statistics
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

