const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
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

        const teacher = await Teacher.findById(teacherId).select('trade').lean();
        if (!teacher) {
            return res.status(404).json({ success: false, message: 'Teacher profile error' });
        }

        const trade = teacher.trade;

        const students = await Student.find({ trade })
            .select('_id full_name email phone_number trade level status createdAt')
            .sort({ full_name: 1 })
            .lean();

        const formattedStudents = students.map(s => ({
            id: s._id,
            ...s,
            phone: s.phone_number,
            created_at: s.createdAt
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

        const student = await Student.findById(studentId)
            .select('_id full_name email phone_number trade level status createdAt')
            .lean();

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({
            success: true,
            student: {
                id: student._id,
                ...student,
                phone: student.phone_number,
                created_at: student.createdAt
            }
        });

    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch student details' });
    }
});

module.exports = router;
