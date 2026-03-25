const express = require('express');
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const AdminNotificationSetting = require('../models/AdminNotificationSetting');
const SiteSetting = require('../models/SiteSetting');
const SMSSetting = require('../models/SMSSetting');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/email');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

const ensureNotificationSettings = async (adminId) => {
  const settings = await AdminNotificationSetting.findOneAndUpdate(
    { admin_id: adminId },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return settings;
};

const getSiteSettings = async () => {
  let settings = await SiteSetting.findOne().lean();
  if (!settings) {
    const newSettings = await SiteSetting.create({
      site_name: 'CSAM Zaccaria TVET',
      site_tagline: 'Excellence in Technical Education',
      contact_email: 'info@csam.edu',
      contact_phone: '+250 000 000 000',
      contact_address: 'Gicumbi, Rwanda'
    });
    settings = newSettings.toObject();
  }
  return settings;
};

const getSMSSettings = async () => {
  let settings = await SMSSetting.findOne().lean();
  if (!settings) {
    const newSettings = await SMSSetting.create({
      provider: 'console',
      enabled: false
    });
    settings = newSettings.toObject();
  }
  return settings;
};

// Profile routes
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select('username email full_name role createdAt updatedAt').lean();
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    
    res.json({ success: true, profile: { id: admin._id, ...admin, created_at: admin.createdAt, updated_at: admin.updatedAt } });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching profile' });
  }
});

router.put(
  '/profile',
  authenticateToken,
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('full_name').trim().notEmpty().withMessage('Full name is required')
  ],
  validate,
  async (req, res) => {
    try {
      const { username, email, full_name } = req.body;
      const adminId = req.user.id;

      const conflicts = await Admin.findOne({
        $or: [{ username }, { email }],
        _id: { $ne: adminId }
      }).select('_id').lean();

      if (conflicts) {
        return res.status(400).json({
          success: false,
          message: 'Username or email already in use by another admin'
        });
      }

      await Admin.findByIdAndUpdate(adminId, { username, email, full_name, updatedAt: new Date() });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        profile: { id: adminId, username, email, full_name }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ success: false, message: 'Server error updating profile' });
    }
  }
);

router.put(
  '/password',
  authenticateToken,
  [
    body('current_password').isLength({ min: 6 }).withMessage('Current password is required'),
    body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
  ],
  validate,
  async (req, res) => {
    try {
      const { current_password, new_password } = req.body;
      const adminId = req.user.id;

      const admin = await Admin.findById(adminId).select('password').lean();
      if (!admin) throw new Error('Admin not found');

      const passwordMatch = await bcrypt.compare(current_password, admin.password);
      if (!passwordMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      await Admin.findByIdAndUpdate(adminId, { password: hashedPassword, updatedAt: new Date() });

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      console.error('Update password error:', error);
      res.status(500).json({ success: false, message: 'Server error updating password' });
    }
  }
);

// Notification settings
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const settings = await ensureNotificationSettings(req.user.id);

    res.json({
      success: true,
      settings: {
        email_notifications: Boolean(settings.email_notifications),
        sms_notifications: Boolean(settings.sms_notifications),
        in_app_notifications: Boolean(settings.in_app_notifications)
      }
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notification settings' });
  }
});

router.put(
  '/notifications',
  authenticateToken,
  [
    body('email_notifications').isBoolean().withMessage('email_notifications must be boolean').toBoolean(),
    body('sms_notifications').isBoolean().withMessage('sms_notifications must be boolean').toBoolean(),
    body('in_app_notifications').isBoolean().withMessage('in_app_notifications must be boolean').toBoolean()
  ],
  validate,
  async (req, res) => {
    try {
      const { email_notifications, sms_notifications, in_app_notifications } = req.body;

      await AdminNotificationSetting.findOneAndUpdate(
        { admin_id: req.user.id },
        { email_notifications, sms_notifications, in_app_notifications, updatedAt: new Date() },
        { upsert: true }
      );

      res.json({
        success: true,
        message: 'Notification settings updated successfully',
        settings: {
          email_notifications,
          sms_notifications,
          in_app_notifications
        }
      });
    } catch (error) {
      console.error('Update notification settings error:', error);
      res.status(500).json({ success: false, message: 'Server error updating notification settings' });
    }
  }
);

// Site settings
router.get('/site', authenticateToken, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    res.json({ success: true, settings: { id: settings._id, ...settings } });
  } catch (error) {
    console.error('Get site settings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching site settings' });
  }
});

router.put(
  '/site',
  authenticateToken,
  [
    body('site_name').trim().notEmpty().withMessage('Site name is required'),
    body('site_tagline').optional().trim().isLength({ max: 255 }).withMessage('Site tagline must be 255 characters or less'),
    body('contact_email').optional({ checkFalsy: true }).isEmail().withMessage('Provide a valid contact email'),
    body('contact_phone').optional({ checkFalsy: true }).isLength({ max: 50 }).withMessage('Contact phone must be 50 characters or less'),
    body('contact_address').optional({ checkFalsy: true }).isLength({ max: 255 }).withMessage('Contact address must be 255 characters or less'),
    body('facebook_url').optional({ checkFalsy: true }).isURL().withMessage('Facebook URL must be valid'),
    body('twitter_url').optional({ checkFalsy: true }).isURL().withMessage('Twitter URL must be valid'),
    body('instagram_url').optional({ checkFalsy: true }).isURL().withMessage('Instagram URL must be valid')
  ],
  validate,
  async (req, res) => {
    try {
      const settings = await getSiteSettings();

      const {
        site_name,
        site_tagline,
        contact_email,
        contact_phone,
        contact_address,
        facebook_url,
        twitter_url,
        instagram_url
      } = req.body;

      const updated = await SiteSetting.findByIdAndUpdate(settings._id, {
        site_name,
        site_tagline: site_tagline || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        contact_address: contact_address || null,
        facebook_url: facebook_url || null,
        twitter_url: twitter_url || null,
        instagram_url: instagram_url || null,
        updated_by: req.user.id,
        updatedAt: new Date()
      }, { new: true }).lean();

      res.json({ success: true, message: 'Site settings updated successfully', settings: { id: updated._id, ...updated } });
    } catch (error) {
      console.error('Update site settings error:', error);
      res.status(500).json({ success: false, message: 'Server error updating site settings' });
    }
  }
);

// SMS settings
router.get('/sms', authenticateToken, async (req, res) => {
  try {
    const settings = await getSMSSettings();

    res.json({
      success: true,
      settings: {
        id: settings._id,
        ...settings,
        enabled: Boolean(settings.enabled),
        additional_config: settings.additional_config ? (typeof settings.additional_config === 'string' ? JSON.parse(settings.additional_config) : settings.additional_config) : {}
      }
    });
  } catch (error) {
    console.error('Get SMS settings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching SMS settings' });
  }
});

router.put(
  '/sms',
  authenticateToken,
  [
    body('provider').optional().isIn(['console', 'africastalking', 'twilio', 'pindo']).withMessage('Invalid provider'),
    body('enabled').optional().isBoolean().withMessage('enabled must be boolean').toBoolean(),
    body('sender_id').optional({ checkFalsy: true }).isLength({ max: 50 }).withMessage('Sender ID must be 50 characters or less'),
    body('username').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('Username must be 100 characters or less'),
    body('api_key').optional({ checkFalsy: true }).isLength({ max: 5000 }).withMessage('API key is too long'),
    body('additional_config').optional()
  ],
  validate,
  async (req, res) => {
    try {
      const settings = await getSMSSettings();
      const {
        provider = settings.provider,
        enabled = Boolean(settings.enabled),
        sender_id = settings.sender_id,
        username = settings.username,
        api_key = settings.api_key,
        additional_config = settings.additional_config
      } = req.body;

      let configToStore = additional_config;
      if (typeof configToStore === 'object' && configToStore !== null) {
        configToStore = JSON.stringify(configToStore);
      } else if (typeof configToStore === 'string') {
        try {
          JSON.parse(configToStore);
        } catch (error) {
          return res.status(400).json({ success: false, message: 'additional_config must be valid JSON' });
        }
      }

      const updated = await SMSSetting.findByIdAndUpdate(settings._id, {
        provider,
        enabled,
        sender_id: sender_id || null,
        username: username || null,
        api_key: api_key || null,
        additional_config: configToStore || null,
        updated_by: req.user.id,
        updatedAt: new Date()
      }, { new: true }).lean();

      res.json({
        success: true,
        message: 'SMS settings updated successfully',
        settings: {
          id: updated._id,
          ...updated,
          enabled: Boolean(updated.enabled),
          additional_config: updated.additional_config ? (typeof updated.additional_config === 'string' ? JSON.parse(updated.additional_config) : updated.additional_config) : {}
        }
      });
    } catch (error) {
      console.error('Update SMS settings error:', error);
      res.status(500).json({ success: false, message: 'Server error updating SMS settings' });
    }
  }
);

module.exports = router;
