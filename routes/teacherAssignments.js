const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Configuration for Multer (File Uploads)
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
        const [assignments] = await db.query(
            `SELECT a.*, 
         (SELECT COUNT(*) FROM student_assignment_submissions s WHERE s.assignment_id = a.id) as submission_count 
         FROM assignments a 
         WHERE a.teacher_id = ? 
         ORDER BY a.created_at DESC`,
            [teacherId]
        );

        res.json({ success: true, assignments });
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
        const [teacherRows] = await db.query('SELECT trade FROM teachers WHERE id = ?', [teacherId]);
        const trade = teacherRows[0].trade;

        const [result] = await db.query(
            `INSERT INTO assignments (title, description, trade, level, deadline, teacher_id, file_path)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title, description, trade, level || 'L1', deadline, teacherId, filePath]
        );

        res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            assignmentId: result.insertId
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
        const [assignRows] = await db.query('SELECT id FROM assignments WHERE id = ? AND teacher_id = ?', [assignmentId, teacherId]);
        if (assignRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Assignment not found or access denied' });
        }

        const [submissions] = await db.query(
            `SELECT sas.*, s.full_name, s.email, s.level
             FROM student_assignment_submissions sas
             JOIN students s ON s.id = sas.student_id
             WHERE sas.assignment_id = ?
             ORDER BY sas.submitted_at DESC`,
            [assignmentId]
        );

        res.json({ success: true, submissions });

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
        const [subRows] = await db.query(
            `SELECT sas.id 
             FROM student_assignment_submissions sas
             JOIN assignments a ON a.id = sas.assignment_id
             WHERE sas.id = ? AND a.teacher_id = ?`,
            [submissionId, teacherId]
        );

        if (subRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Submission not found or access denied' });
        }

        await db.query(
            `UPDATE student_assignment_submissions 
             SET grade = ?, feedback = ?, graded_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [grade, feedback || null, submissionId]
        );

        // Optionally, notify student here (future enhancement)

        res.json({ success: true, message: 'Submission graded successfully' });

    } catch (error) {
        console.error('Grade submission error:', error);
        res.status(500).json({ success: false, message: 'Failed to grade submission' });
    }
});

module.exports = router;
