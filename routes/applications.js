const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticateToken: authMiddleware } = require('../middleware/auth');
const smsService = require('../services/sms');
const emailService = require('../services/email');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads/applications');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'report-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Custom file filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // Increased to 20MB limit
  fileFilter: fileFilter
}).single('report');

// Custom middleware to handle multer errors
const handleUpload = (req, res, next) => {
  upload(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      let errorMessage = 'File upload error';
      if (err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = 'File too large. Maximum file size is 20MB.';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        errorMessage = 'File upload error. Please make sure to upload only one file.';
      }
      return res.status(400).json({
        success: false,
        message: errorMessage,
        code: err.code || 'UPLOAD_ERROR'
      });
    } else if (err) {
      // An unknown error occurred
      return res.status(400).json({
        success: false,
        message: err.message || 'Error processing your request. Please try again.'
      });
    }
    // Everything went fine, proceed to next middleware
    next();
  });
};

// Get all applications (protected - admin only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, program } = req.query;
    
    let query = `
      SELECT 
        sa.*,
        a.username as approved_by_username,
        a.full_name as approved_by_name
      FROM student_applications sa
      LEFT JOIN admins a ON sa.approved_by = a.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND sa.status = ?';
      params.push(status);
    }

    if (program) {
      query += ' AND sa.program = ?';
      params.push(program);
    }

    query += ' ORDER BY sa.created_at DESC';

    const [applications] = await db.query(query, params);

    res.json({
      success: true,
      count: applications.length,
      applications
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching applications'
    });
  }
});

// Get single application by ID (protected)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [applications] = await db.query(`
      SELECT 
        sa.*,
        a.username as approved_by_username,
        a.full_name as approved_by_name
      FROM student_applications sa
      LEFT JOIN admins a ON sa.approved_by = a.id
      WHERE sa.id = ?
    `, [req.params.id]);

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      application: applications[0]
    });
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching application'
    });
  }
});

// Middleware to parse application submissions
const parseApplicationSubmission = (req, res, next) => {
  console.log('=== New Application Request ===');
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Content-Type:', req.headers['content-type']);

  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    console.log('Processing as JSON request');
    return express.json()(req, res, (err) => {
      if (err) {
        console.error('Error parsing JSON:', err);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON format in request body'
        });
      }
      next();
    });
  }

  console.log('Processing as form data with potential file upload');
  return handleUpload(req, res, next);
};

// Submit new application (public)
router.post('/',
  parseApplicationSubmission,
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone_number').trim().notEmpty().withMessage('Phone number is required'),
    body('date_of_birth').isISO8601().toDate().withMessage('Valid date of birth is required'),
    body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Valid gender is required'),
    body('address').trim().notEmpty().withMessage('Address is required'),
    body('program').trim().notEmpty().withMessage('Program is required')
  ],
  async (req, res) => {
    try {
      console.log('=== Processing Application Request ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      if (req.file) {
        console.log('Uploaded file:', {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
      } else {
        console.log('No file uploaded');
      }
      
      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      
      // Ensure required fields are present
      const requiredFields = [
        'full_name', 'email', 'phone_number', 
        'date_of_birth', 'gender', 'address', 'program'
      ];
      
      const missingFields = requiredFields.filter(field => !req.body[field]);
      if (missingFields.length > 0) {
        console.error('Missing required fields:', missingFields);
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          missingFields: missingFields
        });
      }

      // Extract all fields from request body
      const {
        full_name,
        email,
        phone_number,
        date_of_birth,
        gender,
        address,
        program,
        previous_school,
        previous_qualification,
        guardian_name,
        guardian_phone
      } = req.body;

      // Get the file path if a file was uploaded
      const reportPath = req.file ? `/uploads/applications/${req.file.filename}` : null;

      const [result] = await db.query(
        `INSERT INTO student_applications 
        (full_name, email, phone_number, date_of_birth, gender, address, program, 
         previous_school, previous_qualification, guardian_name, guardian_phone, report_path) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          full_name,
          email,
          phone_number,
          date_of_birth,
          gender,
          address,
          program,
          previous_school || null,
          previous_qualification || null,
          guardian_name || null,
          guardian_phone || null,
          reportPath
        ]
      );

      // Send confirmation email to student
      const studentData = {
        full_name,
        email,
        phone_number,
        program,
        date_of_birth,
        address,
        has_report: !!reportPath
      };

      // Add report URL to response if file was uploaded
      if (reportPath) {
        studentData.report_url = `${req.protocol}://${req.get('host')}${reportPath}`;
      }
      
      emailService.sendApplicationConfirmation(studentData).catch(err => {
        console.error('Failed to send confirmation email:', err);
      });

      // Send notification to admin
      emailService.sendAdminNotification(studentData).catch(err => {
        console.error('Failed to send admin notification:', err);
      });

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        applicationId: result.insertId,
        hasReport: !!reportPath,
        application: {
          id: result.insertId,
          full_name,
          email,
          phone_number,
          program,
          status: 'pending'
        }
      });
    } catch (error) {
      console.error('Create application error:', error);
      // Clean up uploaded file if there was an error after file upload
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Error cleaning up file:', unlinkErr);
        });
      }
      
      res.status(500).json({
        success: false,
        message: error.message || 'Server error while submitting application',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Update application status (protected - admin only)
router.patch('/:id/status',
  authMiddleware,
  [
    body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Valid status is required'),
    body('admin_notes').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { status, admin_notes } = req.body;
      const applicationId = req.params.id;
      const adminId = req.user.id;

      // Check if application exists
      const [existingApp] = await db.query(
        'SELECT * FROM student_applications WHERE id = ?',
        [applicationId]
      );

      if (existingApp.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Application not found'
        });
      }

      const application = existingApp[0];

      // Update application status
      await db.query(
        `UPDATE student_applications 
         SET status = ?, admin_notes = ?, approved_by = ?, approved_at = NOW() 
         WHERE id = ?`,
        [status, admin_notes || null, adminId, applicationId]
      );

      // Get updated application
      const [updatedApp] = await db.query(
        'SELECT * FROM student_applications WHERE id = ?',
        [applicationId]
      );

      // Send email notification for status update
      const studentData = {
        full_name: application.full_name,
        email: application.email,
        phone_number: application.phone_number,
        program: application.program
      };
      
      emailService.sendApplicationStatusUpdate(studentData, status, admin_notes).catch(err => {
        console.error('Failed to send status update email:', err);
      });

      // Send SMS notification if status is approved or rejected
      let smsResult = { success: false };
      if (status === 'approved' || status === 'rejected') {
        try {
          smsResult = await smsService.sendApplicationStatusSMS(
            application.phone_number,
            application.full_name,
            status,
            application.program,
            admin_notes
          );
        } catch (smsError) {
          console.error('SMS sending failed:', smsError);
        }
      }

      res.json({
        success: true,
        message: `Application ${status} successfully. Email notification sent.`,
        application: updatedApp[0],
        sms_sent: smsResult.success,
        sms_provider: smsResult.provider
      });
    } catch (error) {
      console.error('Update application status error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while updating application'
      });
    }
  }
);

// Delete application (protected - admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const applicationId = req.params.id;

    const [result] = await db.query(
      'DELETE FROM student_applications WHERE id = ?',
      [applicationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      message: 'Application deleted successfully'
    });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting application'
    });
  }
});

// Get application statistics (protected - admin only)
router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM student_applications
    `);

    const [programStats] = await db.query(`
      SELECT 
        program,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
      FROM student_applications
      GROUP BY program
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      stats: stats[0],
      programStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching statistics'
    });
  }
});

module.exports = router;
