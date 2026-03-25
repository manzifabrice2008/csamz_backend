const mongoose = require('mongoose');

const siteSettingSchema = new mongoose.Schema({
  site_name: { type: String, required: true },
  site_tagline: { type: String },
  contact_email: { type: String },
  contact_phone: { type: String },
  contact_address: { type: String },
  facebook_url: { type: String },
  twitter_url: { type: String },
  instagram_url: { type: String },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

module.exports = mongoose.model('SiteSetting', siteSettingSchema);
