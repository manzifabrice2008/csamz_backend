const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for assignment submissions
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/assignments/submissions';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'submission-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // checks allowed file types if needed
        cb(null, true);
    }
});

// Get assignments list
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Get student's trade and level to filter assignments
        const [studentRows] = await db.query(
            'SELECT trade, level FROM students WHERE id = ?',
            [req.user.id]
        );

        if (studentRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const { trade, level } = studentRows[0];

        // Get assignments for this trade/level, including submission status
        const [assignments] = await db.query(
            `SELECT 
         a.*,
         s.id as submission_id,
         s.submitted_at,
         s.grade,
         s.feedback,
         t.full_name as teacher_name
       FROM assignments a
       LEFT JOIN student_assignment_submissions s ON a.id = s.assignment_id AND s.student_id = ?
       LEFT JOIN teachers t ON a.teacher_id = t.id
       WHERE a.trade = ? AND a.level = ?
       ORDER BY a.deadline ASC`,
            [req.user.id, trade, level]
        );

        res.json({
            success: true,
            assignments
        });
    } catch (error) {
        console.error('Get assignments error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Submit assignment
router.post('/:id/submit', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const assignmentId = req.params.id;
        const studentId = req.user.id;
        const filePath = `/uploads/assignments/submissions/${req.file.filename}`;

        // Check if already submitted
        const [existing] = await db.query(
            'SELECT id FROM student_assignment_submissions WHERE assignment_id = ? AND student_id = ?',
            [assignmentId, studentId]
        );

        if (existing.length > 0) {
            // Update existing submission
            await db.query(
                `UPDATE student_assignment_submissions 
                 SET submission_path = ?, submitted_at = NOW() 
                 WHERE id = ?`,
                [filePath, existing[0].id]
            );
        } else {
            // Insert new submission
            await db.query(
                `INSERT INTO student_assignment_submissions (assignment_id, student_id, submission_path)
                 VALUES (?, ?, ?)`,
                [assignmentId, studentId, filePath]
            );
        }

        res.json({
            success: true,
            message: 'Assignment submitted successfully',
            filePath
        });

    } catch (error) {
        console.error('Submit assignment error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get specific assignment details
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const [rows] = await db.query(
            `SELECT a.*, t.full_name as teacher_name 
             FROM assignments a
             LEFT JOIN teachers t ON a.teacher_id = t.id
             WHERE a.id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        const assignment = rows[0];

        // Check submission
        const [submission] = await db.query(
            'SELECT * FROM student_assignment_submissions WHERE assignment_id = ? AND student_id = ?',
            [assignment.id, req.user.id]
        );

        res.json({
            success: true,
            assignment,
            submission: submission[0] || null
        });

    } catch (error) {
        console.error('Get assignment details error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
