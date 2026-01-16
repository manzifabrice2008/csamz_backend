const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
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
  const [existing] = await db.query(
    'SELECT * FROM admin_notification_settings WHERE admin_id = ?',
    [adminId]
  );

  if (existing.length === 0) {
    await db.query(
      'INSERT INTO admin_notification_settings (admin_id) VALUES (?)',
      [adminId]
    );

    return {
      email_notifications: 1,
      sms_notifications: 0,
      in_app_notifications: 1
    };
  }

  return existing[0];
};

const getSiteSettings = async () => {
  const [rows] = await db.query('SELECT * FROM site_settings LIMIT 1');
  if (rows.length === 0) {
    await db.query(
      'INSERT INTO site_settings (site_name, site_tagline, contact_email, contact_phone, contact_address) VALUES (?, ?, ?, ?, ?)',
      ['CSAM Zaccaria TVET', 'Excellence in Technical Education', 'info@csam.edu', '+250 000 000 000', 'Gicumbi, Rwanda']
    );
    return (await db.query('SELECT * FROM site_settings LIMIT 1'))[0][0];
  }
  return rows[0];
};

const getSMSSettings = async () => {
  const [rows] = await db.query('SELECT * FROM sms_settings LIMIT 1');
  if (rows.length === 0) {
    await db.query('INSERT INTO sms_settings (provider, enabled) VALUES (?, ?)', ['console', 0]);
    return (await db.query('SELECT * FROM sms_settings LIMIT 1'))[0][0];
  }
  return rows[0];
};

const createPasswordResetToken = async (adminId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query('DELETE FROM admin_password_resets WHERE admin_id = ?', [adminId]);
  await db.query(
    `INSERT INTO admin_password_resets (admin_id, token_hash, expires_at)
     VALUES (?, ?, ?)`
    ,
    [adminId, tokenHash, expiresAt]
  );

  return token;
};

// Profile routes
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [admins] = await db.query(
      'SELECT id, username, email, full_name, role, created_at, updated_at FROM admins WHERE id = ?',
      [req.user.id]
    );

    if (admins.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.json({ success: true, profile: admins[0] });
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

      const [conflicts] = await db.query(
        'SELECT id FROM admins WHERE (username = ? OR email = ?) AND id != ?',
        [username, email, adminId]
      );

      if (conflicts.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Username or email already in use by another admin'
        });
      }

      await db.query(
        'UPDATE admins SET username = ?, email = ?, full_name = ? WHERE id = ?',
        [username, email, full_name, adminId]
      );

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

      const [admins] = await db.query('SELECT password FROM admins WHERE id = ?', [adminId]);

      if (admins.length === 0) {
        return res.status(404).json({ success: false, message: 'Admin not found' });
      }

      const admin = admins[0];
      const passwordMatch = await bcrypt.compare(current_password, admin.password);

      if (!passwordMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      await db.query('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, adminId]);

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
      await ensureNotificationSettings(req.user.id);

      const { email_notifications, sms_notifications, in_app_notifications } = req.body;

      await db.query(
        `UPDATE admin_notification_settings
         SET email_notifications = ?, sms_notifications = ?, in_app_notifications = ?, updated_at = CURRENT_TIMESTAMP
         WHERE admin_id = ?`,
        [email_notifications ? 1 : 0, sms_notifications ? 1 : 0, in_app_notifications ? 1 : 0, req.user.id]
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
    res.json({ success: true, settings });
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

      await db.query(
        `UPDATE site_settings
         SET site_name = ?,
             site_tagline = ?,
             contact_email = ?,
             contact_phone = ?,
             contact_address = ?,
             facebook_url = ?,
             twitter_url = ?,
             instagram_url = ?,
             updated_by = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          site_name,
          site_tagline || null,
          contact_email || null,
          contact_phone || null,
          contact_address || null,
          facebook_url || null,
          twitter_url || null,
          instagram_url || null,
          req.user.id,
          settings.id
        ]
      );

      const [updated] = await db.query('SELECT * FROM site_settings WHERE id = ?', [settings.id]);

      res.json({ success: true, message: 'Site settings updated successfully', settings: updated[0] });
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
        ...settings,
        enabled: Boolean(settings.enabled),
        additional_config: settings.additional_config ? JSON.parse(settings.additional_config) : {}
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

      await db.query(
        `UPDATE sms_settings
         SET provider = ?,
             enabled = ?,
             sender_id = ?,
             username = ?,
             api_key = ?,
             additional_config = ?,
             updated_by = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          provider,
          enabled ? 1 : 0,
          sender_id || null,
          username || null,
          api_key || null,
          configToStore || null,
          req.user.id,
          settings.id
        ]
      );

      const [updated] = await db.query('SELECT * FROM sms_settings WHERE id = ?', [settings.id]);
      const updatedSettings = updated[0];

      res.json({
        success: true,
        message: 'SMS settings updated successfully',
        settings: {
          ...updatedSettings,
          enabled: Boolean(updatedSettings.enabled),
          additional_config: updatedSettings.additional_config ? JSON.parse(updatedSettings.additional_config) : {}
        }
      });
    } catch (error) {
      console.error('Update SMS settings error:', error);
      res.status(500).json({ success: false, message: 'Server error updating SMS settings' });
    }
  }
);

module.exports = router;
