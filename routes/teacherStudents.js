const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const ensureTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied. Teachers only.' });
    }
    next();
};

// Get all students (filtered by teacher's trade)
router.get('/', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const teacherId = req.user.id;

        // Get teacher's trade
        const { data: teacher, error: teacherError } = await supabase
            .from('teachers')
            .select('trade')
            .eq('id', teacherId)
            .single();

        if (teacherError) {
            if (teacherError.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Teacher profile error' });
            throw teacherError;
        }

        const trade = teacher.trade;

        // Get students in that trade
        // Excluding sensitive fields like password
        const { data: students, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, email, phone_number, trade, level, status, created_at')
            .eq('trade', trade)
            .order('full_name', { ascending: true });

        if (studentError) throw studentError;

        // Map phone_number to phone for consistency
        const formattedStudents = students.map(s => ({
            ...s,
            phone: s.phone_number
        }));

        res.json({
            success: true,
            students: formattedStudents
        });

    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
});

// Get specific student details
router.get('/:id', authenticateToken, ensureTeacher, async (req, res) => {
    try {
        const studentId = req.params.id;

        const { data: student, error } = await supabase
            .from('students')
            .select('id, full_name, email, phone_number, trade, level, status, created_at')
            .eq('id', studentId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ success: false, message: 'Student not found' });
            throw error;
        }

        res.json({
            success: true,
            student: {
                ...student,
                phone: student.phone_number
            }
        });

    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch student details' });
    }
});

module.exports = router;
