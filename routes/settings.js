const express = require('express');
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
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
  const { data: existing, error: fetchError } = await supabase
    .from('admin_notification_settings')
    .select('*')
    .eq('admin_id', adminId)
    .single();

  if (fetchError && fetchError.code === 'PGRST116') {
    const { data: inserted, error: insertError } = await supabase
      .from('admin_notification_settings')
      .insert([{ admin_id: adminId }])
      .select()
      .single();

    if (insertError) throw insertError;
    return inserted;
  }

  if (fetchError) throw fetchError;
  return existing;
};

const getSiteSettings = async () => {
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: inserted, error: insertError } = await supabase
      .from('site_settings')
      .insert([{
        site_name: 'CSAM Zaccaria TVET',
        site_tagline: 'Excellence in Technical Education',
        contact_email: 'info@csam.edu',
        contact_phone: '+250 000 000 000',
        contact_address: 'Gicumbi, Rwanda'
      }])
      .select()
      .single();

    if (insertError) throw insertError;
    return inserted;
  }
  return data;
};

const getSMSSettings = async () => {
  const { data, error } = await supabase
    .from('sms_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: inserted, error: insertError } = await supabase
      .from('sms_settings')
      .insert([{ provider: 'console', enabled: false }])
      .select()
      .single();

    if (insertError) throw insertError;
    return inserted;
  }
  return data;
};

// Profile routes
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, username, email, full_name, role, created_at, updated_at')
      .eq('id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: 'Admin not found' });
      }
      throw error;
    }

    res.json({ success: true, profile: admin });
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

      const { data: conflicts, error: fetchError } = await supabase
        .from('admins')
        .select('id')
        .or(`username.eq.${username},email.eq.${email}`)
        .neq('id', adminId);

      if (fetchError) throw fetchError;

      if (conflicts && conflicts.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Username or email already in use by another admin'
        });
      }

      const { error: updateError } = await supabase
        .from('admins')
        .update({ username, email, full_name, updated_at: new Date().toISOString() })
        .eq('id', adminId);

      if (updateError) throw updateError;

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

      const { data: admin, error: fetchError } = await supabase
        .from('admins')
        .select('password')
        .eq('id', adminId)
        .single();

      if (fetchError) throw fetchError;

      const passwordMatch = await bcrypt.compare(current_password, admin.password);
      if (!passwordMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);

      const { error: updateError } = await supabase
        .from('admins')
        .update({ password: hashedPassword, updated_at: new Date().toISOString() })
        .eq('id', adminId);

      if (updateError) throw updateError;

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

      const { error } = await supabase
        .from('admin_notification_settings')
        .update({
          email_notifications: email_notifications ? 1 : 0,
          sms_notifications: sms_notifications ? 1 : 0,
          in_app_notifications: in_app_notifications ? 1 : 0,
          updated_at: new Date().toISOString()
        })
        .eq('admin_id', req.user.id);

      if (error) throw error;

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

      const { data: updated, error } = await supabase
        .from('site_settings')
        .update({
          site_name,
          site_tagline: site_tagline || null,
          contact_email: contact_email || null,
          contact_phone: contact_phone || null,
          contact_address: contact_address || null,
          facebook_url: facebook_url || null,
          twitter_url: twitter_url || null,
          instagram_url: instagram_url || null,
          updated_by: req.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, message: 'Site settings updated successfully', settings: updated });
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

      const { data: updated, error } = await supabase
        .from('sms_settings')
        .update({
          provider,
          enabled: enabled ? 1 : 0,
          sender_id: sender_id || null,
          username: username || null,
          api_key: api_key || null,
          additional_config: configToStore || null,
          updated_by: req.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        message: 'SMS settings updated successfully',
        settings: {
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
