const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { authenticateToken } = require('../middleware/auth');
const { normalizeStudentRecord } = require('../utils/studentClassification');

const ensureAdmin = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
        return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }
    next();
};

router.get('/', authenticateToken, ensureAdmin, async (req, res) => {
    try {
        const students = await Student.find()
            .select('full_name username email phone_number trade level status createdAt')
            .sort({ createdAt: -1 })
            .lean();

        const formattedStudents = students.map((s) => {
            const normalized = normalizeStudentRecord(s);
            return {
                id: normalized._id,
                ...normalized,
                created_at: s.createdAt
            };
        });

        res.json({
            success: true,
            students: formattedStudents
        });
    } catch (error) {
        console.error('Admin get students error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
});

router.patch('/:id/status', authenticateToken, ensureAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const student = await Student.findByIdAndUpdate(id, { status }, { new: true }).lean();

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({
            success: true,
            message: `Student status updated to ${status}`,
            student: { id: student._id, ...student, created_at: student.createdAt }
        });
    } catch (error) {
        console.error('Update student status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update student status' });
    }
});

router.delete('/:id', authenticateToken, ensureAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const student = await Student.findByIdAndDelete(id);

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({
            success: true,
            message: 'Student deleted successfully'
        });
    } catch (error) {
        console.error('Delete student error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete student' });
    }
});

module.exports = router;
