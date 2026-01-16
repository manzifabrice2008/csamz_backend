const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
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
      // Check if user is a student
      if (req.user.role !== 'student') {
        return res.status(403).json({
          success: false,
          message: 'Only students can submit transfer requests'
        });
      }

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      // Check if document was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Witness document is required'
        });
      }

      const { currentInstitution, targetInstitution, reason } = req.body;
      const documentPath = `/uploads/${req.file.filename}`;

      // Save to database
      const { data, error } = await supabase
        .from('institution_transfers')
        .insert([{
          student_id: req.user.id,
          current_institution: currentInstitution,
          target_institution: targetInstitution,
          reason,
          witness_document_path: documentPath
        }])
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'Transfer request submitted successfully',
        transferId: data.id
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
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can view transfer requests'
      });
    }

    const { data: transfers, error } = await supabase
      .from('institution_transfers')
      .select('*, student:students(full_name, trade)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedTransfers = transfers.map(it => ({
      ...it,
      student_name: it.student?.full_name,
      student_trade: it.student?.trade,
      document_url: `/api/upload/witness-document/${it.witness_document_path.split('/').pop()}`
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
      // Check if user is admin
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

      // Update transfer status
      const { data: transfer, error: updateError } = await supabase
        .from('institution_transfers')
        .update({
          status,
          admin_notes: adminNotes || null,
          processed_by: req.user.id,
          processed_at: new Date().toISOString()
        })
        .eq('id', transferId)
        .select()
        .single();

      if (updateError) throw updateError;

      // If approved, update student's institution
      if (status === 'approved') {
        // Update student's institution
        const { error: studentUpdateError } = await supabase
          .from('students')
          .update({ institution: transfer.target_institution })
          .eq('id', transfer.student_id);

        if (studentUpdateError) throw studentUpdateError;
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

    const { data: transfers, error } = await supabase
      .from('institution_transfers')
      .select('*')
      .eq('student_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedTransfers = transfers.map(it => ({
      ...it,
      document_url: `/api/upload/witness-document/${it.witness_document_path.split('/').pop()}`
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
