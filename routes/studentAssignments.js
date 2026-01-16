const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
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

        // Get student's trade and level to filter assignments
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('trade, level')
            .eq('id', studentId)
            .single();

        if (studentError) {
            if (studentError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Student not found' });
            throw studentError;
        }

        const { trade, level } = student;

        // Get assignments for this trade/level, including submission status
        // Using inner join on teachers and left join on submissions
        const { data: assignments, error: aError } = await supabase
            .from('assignments')
            .select('*, submissions:student_assignment_submissions!left(*), teacher:teachers(full_name)')
            .eq('trade', trade)
            .eq('level', level)
            .order('deadline', { ascending: true });

        if (aError) throw aError;

        // Filter submissions for current student and format
        const formatted = assignments.map(a => {
            const studentSumission = (a.submissions || []).find(s => s.student_id === studentId);
            return {
                ...a,
                submission_id: studentSumission?.id || null,
                submitted_at: studentSumission?.submitted_at || null,
                grade: studentSumission?.grade || null,
                feedback: studentSumission?.feedback || null,
                teacher_name: a.teacher?.full_name,
                submissions: undefined,
                teacher: undefined
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

        const { data, error } = await supabase
            .from('student_assignment_submissions')
            .upsert({
                assignment_id: assignmentId,
                student_id: studentId,
                submission_path: filePath,
                submitted_at: new Date().toISOString()
            }, { onConflict: 'assignment_id,student_id' })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Assignment submitted successfully',
            filePath: data.submission_path
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

        const { data: assignment, error: aError } = await supabase
            .from('assignments')
            .select('*, teacher:teachers(full_name)')
            .eq('id', assignmentId)
            .single();

        if (aError) {
            if (aError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Assignment not found' });
            throw aError;
        }

        // Check submission
        const { data: submission, error: sError } = await supabase
            .from('student_assignment_submissions')
            .select('*')
            .eq('assignment_id', assignmentId)
            .eq('student_id', studentId)
            .maybeSingle();

        if (sError) throw sError;

        res.json({
            success: true,
            assignment: {
                ...assignment,
                teacher_name: assignment.teacher?.full_name,
                teacher: undefined
            },
            submission: submission || null
        });

    } catch (error) {
        console.error('Get assignment details error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
