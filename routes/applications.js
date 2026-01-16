const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/database');
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
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
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
      return res.status(400).json({
        success: false,
        message: err.message || 'Error processing your request. Please try again.'
      });
    }
    next();
  });
};

// Get all applications (protected - admin only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, program } = req.query;

    let query = supabase
      .from('student_applications')
      .select('*, approved_by:admins(username, full_name)');

    if (status) query = query.eq('status', status);
    if (program) query = query.eq('program', program);

    query = query.order('created_at', { ascending: false });

    const { data: applications, error } = await query;

    if (error) throw error;

    // Flatten join result for backward compatibility
    const formattedApps = applications.map(app => ({
      ...app,
      approved_by_username: app.approved_by?.username || null,
      approved_by_name: app.approved_by?.full_name || null,
      approved_by: app.approved_by ? undefined : null // Clean up if joined, or null
    }));

    res.json({
      success: true,
      count: formattedApps.length,
      applications: formattedApps
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
    const { data: application, error } = await supabase
      .from('student_applications')
      .select('*, approved_by:admins(username, full_name)')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Application not found'
        });
      }
      throw error;
    }

    const formattedApp = {
      ...application,
      approved_by_username: application.approved_by?.username || null,
      approved_by_name: application.approved_by?.full_name || null,
      approved_by: application.approved_by ? undefined : null
    };

    res.json({
      success: true,
      application: formattedApp
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
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
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
      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

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

      const reportPath = req.file ? `/uploads/applications/${req.file.filename}` : null;

      const { data: result, error } = await supabase
        .from('student_applications')
        .insert([{
          full_name,
          email,
          phone_number,
          date_of_birth,
          gender,
          address,
          program,
          previous_school: previous_school || null,
          previous_qualification: previous_qualification || null,
          guardian_name: guardian_name || null,
          guardian_phone: guardian_phone || null,
          report_path: reportPath
        }])
        .select()
        .single();

      if (error) throw error;

      // Send confirmation emails (async)
      const studentData = {
        full_name,
        email,
        phone_number,
        program,
        date_of_birth,
        address,
        has_report: !!reportPath,
        report_url: reportPath ? `${req.protocol}://${req.get('host')}${reportPath}` : null
      };

      emailService.sendApplicationConfirmation(studentData).catch(err => console.error('Email error:', err));
      emailService.sendAdminNotification(studentData).catch(err => console.error('Admin email error:', err));

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        applicationId: result.id,
        hasReport: !!reportPath,
        application: {
          id: result.id,
          full_name,
          email,
          phone_number,
          program,
          status: 'pending'
        }
      });
    } catch (error) {
      console.error('Create application error:', error);
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Error cleaning up file:', unlinkErr);
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Server error while submitting application'
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

      // Check existence and get data
      const { data: application, error: fetchError } = await supabase
        .from('student_applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            message: 'Application not found'
          });
        }
        throw fetchError;
      }

      // Update application
      const { data: updatedApp, error: updateError } = await supabase
        .from('student_applications')
        .update({
          status,
          admin_notes: admin_notes || null,
          approved_by: adminId,
          approved_at: new Date().toISOString()
        })
        .eq('id', applicationId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Notifications
      const studentData = {
        full_name: application.full_name,
        email: application.email,
        phone_number: application.phone_number,
        program: application.program
      };

      emailService.sendApplicationStatusUpdate(studentData, status, admin_notes).catch(err => console.error('Status update email failed:', err));

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
        message: `Application ${status} successfully.`,
        application: updatedApp,
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
    const { error, count } = await supabase
      .from('student_applications')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);

    if (error) throw error;
    if (count === 0) {
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
    // We can use RPC or run multiple counts
    const { data: applications, error } = await supabase
      .from('student_applications')
      .select('status, program');

    if (error) throw error;

    const stats = {
      total: applications.length,
      pending: applications.filter(a => a.status === 'pending').length,
      approved: applications.filter(a => a.status === 'approved').length,
      rejected: applications.filter(a => a.status === 'rejected').length
    };

    const programMap = {};
    applications.forEach(a => {
      if (!programMap[a.program]) {
        programMap[a.program] = { program: a.program, count: 0, approved_count: 0 };
      }
      programMap[a.program].count++;
      if (a.status === 'approved') {
        programMap[a.program].approved_count++;
      }
    });

    const programStats = Object.values(programMap).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      stats,
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
