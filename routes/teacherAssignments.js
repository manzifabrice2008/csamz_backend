const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Teacher = require('../models/Teacher');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

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
    limits: { fileSize: 10 * 1024 * 1024 }
});

const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

router.get('/', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        const assignments = await Assignment.find({ teacher_id: teacherId })
            .sort({ createdAt: -1 })
            .lean();

        const assignmentIds = assignments.map(a => a._id);
        const submissions = await Submission.find({ assignment_id: { $in: assignmentIds } }).lean();

        const formatted = assignments.map(a => {
            const assignmentSubmissions = submissions.filter(s => s.assignment_id.toString() === a._id.toString());
            return {
                id: a._id,
                ...a,
                created_at: a.createdAt,
                submission_count: assignmentSubmissions.length
            };
        });

        res.json({ success: true, assignments: formatted });
    } catch (error) {
        console.error('List assignments error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
    }
});

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

        const teacher = await Teacher.findById(teacherId).select('trade').lean();
        if (!teacher) throw new Error('Teacher not found');

        const result = await Assignment.create({
            title,
            description,
            trade: teacher.trade,
            level: level || 'L1',
            deadline,
            teacher_id: teacherId,
            file_path: filePath
        });

        res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            assignmentId: result._id
        });

    } catch (error) {
        console.error('Create assignment error:', error);
        res.status(500).json({ success: false, message: 'Failed to create assignment' });
    }
});

router.get('/:id/submissions', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const teacherId = req.user.id;

        const assign = await Assignment.findOne({ _id: assignmentId, teacher_id: teacherId }).select('_id').lean();

        if (!assign) {
            return res.status(404).json({ success: false, message: 'Assignment not found or access denied' });
        }

        const submissions = await Submission.find({ assignment_id: assignmentId })
            .populate('student_id', 'full_name email level')
            .sort({ submitted_at: -1 })
            .lean();

        const formattedSubmissions = submissions.map(s => ({
            id: s._id,
            ...s,
            full_name: s.student_id?.full_name,
            email: s.student_id?.email,
            level: s.student_id?.level,
            student_id: undefined
        }));

        res.json({ success: true, submissions: formattedSubmissions });

    } catch (error) {
        console.error('Get submissions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
    }
});

router.post('/submissions/:id/grade', authenticateToken, ensureTeacher, [
    body('grade').isInt({ min: 0, max: 100 }).withMessage('Grade must be between 0 and 100'),
    body('feedback').optional().trim().isString()
], async (req, res) => {
    try {
        const submissionId = req.params.id;
        const teacherId = req.user.id;
        const { grade, feedback } = req.body;

        const sub = await Submission.findById(submissionId).populate('assignment_id', 'teacher_id').lean();

        if (!sub) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }

        if (sub.assignment_id?.teacher_id.toString() !== teacherId.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        await Submission.findByIdAndUpdate(submissionId, {
            grade,
            feedback: feedback || null,
            graded_at: new Date()
        });

        res.json({ success: true, message: 'Submission graded successfully' });

    } catch (error) {
        console.error('Grade submission error:', error);
        res.status(500).json({ success: false, message: 'Failed to grade submission' });
    }
});

module.exports = router;
