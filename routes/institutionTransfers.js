const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
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
      const [result] = await db.query(
        'INSERT INTO institution_transfers (student_id, current_institution, target_institution, reason, witness_document_path) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, currentInstitution, targetInstitution, reason, documentPath]
      );

      res.status(201).json({
        success: true,
        message: 'Transfer request submitted successfully',
        transferId: result.insertId
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

    const [transfers] = await db.query(`
      SELECT 
        it.*, 
        s.full_name as student_name, 
        s.trade as student_trade,
        CONCAT('/api/upload/witness-document/', SUBSTRING_INDEX(it.witness_document_path, '/', -1)) as document_url
      FROM institution_transfers it
      JOIN students s ON it.student_id = s.id
      ORDER BY it.created_at DESC
    `);

    res.json({
      success: true,
      count: transfers.length,
      transfers
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
      await db.query(
        'UPDATE institution_transfers SET status = ?, admin_notes = ?, processed_by = ?, processed_at = NOW() WHERE id = ?',
        [status, adminNotes || null, req.user.id, transferId]
      );

      // If approved, update student's institution
      if (status === 'approved') {
        // Get the target institution from the transfer request
        const [transfer] = await db.query(
          'SELECT student_id, target_institution FROM institution_transfers WHERE id = ?',
          [transferId]
        );

        if (transfer.length > 0) {
          // Update student's institution (assuming we add an institution field to students table)
          await db.query(
            'UPDATE students SET institution = ? WHERE id = ?',
            [transfer[0].target_institution, transfer[0].student_id]
          );
        }
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

    const [transfers] = await db.query(
      `SELECT 
        it.*,
        CONCAT('/api/upload/witness-document/', SUBSTRING_INDEX(it.witness_document_path, '/', -1)) as document_url
      FROM institution_transfers it 
      WHERE student_id = ? 
      ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      count: transfers.length,
      transfers
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
