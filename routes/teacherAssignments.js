const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Configuration for Multer (File Uploads) - Local storage for now as original
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/assignments/materials';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

// GET / - List assignments created by the teacher
router.get('/', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        const { data: assignments, error } = await supabase
            .from('assignments')
            .select('*, submissions:student_assignment_submissions(id)')
            .eq('teacher_id', teacherId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const formatted = assignments.map(a => ({
            ...a,
            submission_count: a.submissions?.length || 0
        }));

        res.json({ success: true, assignments: formatted });
    } catch (error) {
        console.error('List assignments error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
    }
});

// POST / - Create new assignment
router.post('/', authenticateToken, ensureTeacher, upload.single('file'), [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('deadline').isISO8601().toDate().withMessage('Valid deadline is required'),
    body('level').optional().isIn(['L1', 'L2', 'L3', 'L4', 'L5']),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const teacherId = req.user.id;
        const { title, description, deadline, level } = req.body;
        const filePath = req.file ? req.file.path : null;

        // Get teacher trade
        const { data: teacher, error: tError } = await supabase
            .from('teachers')
            .select('trade')
            .eq('id', teacherId)
            .single();

        if (tError) throw tError;

        const { data: result, error: insertError } = await supabase
            .from('assignments')
            .insert([{
                title,
                description,
                trade: teacher.trade,
                level: level || 'L1',
                deadline,
                teacher_id: teacherId,
                file_path: filePath
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            assignmentId: result.id
        });

    } catch (error) {
        console.error('Create assignment error:', error);
        res.status(500).json({ success: false, message: 'Failed to create assignment' });
    }
});

// GET /:id/submissions - Get all submissions for a specific assignment
router.get('/:id/submissions', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const teacherId = req.user.id;

        // Verify assignment belongs to teacher
        const { data: assign, error: vError } = await supabase
            .from('assignments')
            .select('id')
            .eq('id', assignmentId)
            .eq('teacher_id', teacherId)
            .maybeSingle();

        if (vError) throw vError;
        if (!assign) {
            return res.status(404).json({ success: false, message: 'Assignment not found or access denied' });
        }

        const { data: submissions, error: sError } = await supabase
            .from('student_assignment_submissions')
            .select('*, student:students(full_name, email, level)')
            .eq('assignment_id', assignmentId)
            .order('submitted_at', { ascending: false });

        if (sError) throw sError;

        const formattedSubmissions = submissions.map(s => ({
            ...s,
            full_name: s.student?.full_name,
            email: s.student?.email,
            level: s.student?.level
        }));

        res.json({ success: true, submissions: formattedSubmissions });

    } catch (error) {
        console.error('Get submissions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
    }
});

// POST /submissions/:id/grade - Grade a submission
router.post('/submissions/:id/grade', authenticateToken, ensureTeacher, [
    body('grade').isInt({ min: 0, max: 100 }).withMessage('Grade must be between 0 and 100'),
    body('feedback').optional().trim().isString()
], async (req, res) => {
    try {
        const submissionId = req.params.id;
        const teacherId = req.user.id;
        const { grade, feedback } = req.body;

        // Verify submission belongs to an assignment created by this teacher
        const { data: sub, error: vError } = await supabase
            .from('student_assignment_submissions')
            .select('id, assignment:assignments(teacher_id)')
            .eq('id', submissionId)
            .single();

        if (vError) {
            if (vError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Submission not found' });
            throw vError;
        }

        if (sub.assignment?.teacher_id !== teacherId) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { error: updateError } = await supabase
            .from('student_assignment_submissions')
            .update({
                grade,
                feedback: feedback || null,
                graded_at: new Date().toISOString()
            })
            .eq('id', submissionId);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Submission graded successfully' });

    } catch (error) {
        console.error('Grade submission error:', error);
        res.status(500).json({ success: false, message: 'Failed to grade submission' });
    }
});

module.exports = router;
