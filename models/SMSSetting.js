const mongoose = require('mongoose');

const smsSettingSchema = new mongoose.Schema({
  provider: { type: String, enum: ['console', 'africastalking', 'twilio', 'pindo'], default: 'console' },
  enabled: { type: Boolean, default: false },
  sender_id: { type: String },
  api_key: { type: String },
  username: { type: String },
  additional_config: { type: mongoose.Schema.Types.Mixed }, // For JSON configurations
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

module.exports = mongoose.model('SMSSetting', smsSettingSchema);
