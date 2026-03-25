const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        cb(null, true);
    }
});

// Get assignments list
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const studentId = req.user.id;

        const student = await Student.findById(studentId).select('trade level').lean();
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const { trade, level } = student;

        const assignments = await Assignment.find({ trade, level })
            .populate('teacher_id', 'full_name')
            .sort({ deadline: 1 })
            .lean();

        const assignmentIds = assignments.map(a => a._id);
        const submissions = await Submission.find({ student_id: studentId, assignment_id: { $in: assignmentIds } }).lean();

        const formatted = assignments.map(a => {
            const studentSubmission = submissions.find(s => s.assignment_id.toString() === a._id.toString());
            return {
                id: a._id,
                ...a,
                submission_id: studentSubmission?._id || null,
                submitted_at: studentSubmission?.submitted_at || null,
                grade: studentSubmission?.grade || null,
                feedback: studentSubmission?.feedback || null,
                teacher_name: a.teacher_id?.full_name,
                teacher_id: undefined
            };
        });

        res.json({
            success: true,
            assignments: formatted
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

        const data = await Submission.findOneAndUpdate(
            { assignment_id: assignmentId, student_id: studentId },
            { file_path: filePath, submitted_at: new Date() },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            message: 'Assignment submitted successfully',
            filePath: data.file_path
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

        const assignmentId = req.params.id;
        const studentId = req.user.id;

        const assignment = await Assignment.findById(assignmentId).populate('teacher_id', 'full_name').lean();
        
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        const submission = await Submission.findOne({ assignment_id: assignmentId, student_id: studentId }).lean();

        res.json({
            success: true,
            assignment: {
                id: assignment._id,
                ...assignment,
                teacher_name: assignment.teacher_id?.full_name,
                teacher_id: undefined
            },
            submission: submission || null
        });

    } catch (error) {
        console.error('Get assignment details error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
