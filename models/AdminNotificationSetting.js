const mongoose = require('mongoose');

const adminNotificationSettingSchema = new mongoose.Schema({
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, unique: true },
  email_notifications: { type: Boolean, default: true },
  sms_notifications: { type: Boolean, default: false },
  in_app_notifications: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('AdminNotificationSetting', adminNotificationSettingSchema);
