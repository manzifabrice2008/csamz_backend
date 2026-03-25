const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Transfer = require('../models/Transfer');
const Student = require('../models/Student');
const { authenticateToken } = require('../middleware/auth');
const { uploadDocument } = require('./upload');

// Student submits transfer request with witness document
router.post('/request',
  authenticateToken,
  uploadDocument.single('witnessDocument'),
  [
    body('currentInstitution').trim().notEmpty().withMessage('Current institution is required'),
    body('targetInstitution').trim().notEmpty().withMessage('Target institution is required'),
    body('reason').trim().notEmpty().withMessage('Reason for transfer is required')
  ],
  async (req, res) => {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({
          success: false,
          message: 'Only students can submit transfer requests'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Witness document is required'
        });
      }

      const { currentInstitution, targetInstitution, reason } = req.body;
      const documentPath = `/uploads/${req.file.filename}`;

      const transfer = await Transfer.create({
        student_id: req.user.id,
        current_institution: currentInstitution,
        target_institution: targetInstitution,
        reason,
        witness_document_path: documentPath
      });

      res.status(201).json({
        success: true,
        message: 'Transfer request submitted successfully',
        transferId: transfer._id
      });
    } catch (error) {
      console.error('Transfer request error:', error);
      res.status(500).json({
        success: false,
        message: 'Error submitting transfer request'
      });
    }
  }
);

// Get all transfer requests (admin only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can view transfer requests'
      });
    }

    const transfers = await Transfer.find()
      .populate('student_id', 'full_name trade')
      .sort({ createdAt: -1 })
      .lean();

    const formattedTransfers = transfers.map(it => ({
      id: it._id,
      ...it,
      student_name: it.student_id?.full_name,
      student_trade: it.student_id?.trade,
      document_url: `/api/upload/witness-document/${it.witness_document_path.split('/').pop()}`,
      created_at: it.createdAt
    }));

    res.json({
      success: true,
      count: formattedTransfers.length,
      transfers: formattedTransfers
    });
  } catch (error) {
    console.error('Get transfer requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transfer requests'
    });
  }
});

// Update transfer status (admin only)
router.patch('/:id/status',
  authenticateToken,
  [
    body('status').isIn(['approved', 'rejected']).withMessage('Invalid status'),
    body('adminNotes').optional().trim()
  ],
  async (req, res) => {
    try {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can update transfer requests'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { status, adminNotes } = req.body;
      const transferId = req.params.id;

      const transfer = await Transfer.findByIdAndUpdate(transferId, {
        status,
        admin_notes: adminNotes || null,
        processed_by: req.user.id,
        processed_at: new Date()
      }, { new: true }).lean();

      if (!transfer) {
        return res.status(404).json({ success: false, message: 'Transfer request not found' });
      }

      if (status === 'approved') {
        await Student.findByIdAndUpdate(transfer.student_id, {
          institution: transfer.target_institution
        });
      }

      res.json({
        success: true,
        message: `Transfer request ${status} successfully`
      });
    } catch (error) {
      console.error('Update transfer status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating transfer status'
      });
    }
  }
);

// Get transfer requests for current student
router.get('/my-requests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can view their transfer requests'
      });
    }

    const transfers = await Transfer.find({ student_id: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const formattedTransfers = transfers.map(it => ({
      id: it._id,
      ...it,
      document_url: `/api/upload/witness-document/${it.witness_document_path.split('/').pop()}`,
      created_at: it.createdAt
    }));

    res.json({
      success: true,
      count: formattedTransfers.length,
      transfers: formattedTransfers
    });
  } catch (error) {
    console.error('Get my transfer requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transfer requests'
    });
  }
});

module.exports = router;
