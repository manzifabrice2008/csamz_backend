const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  email: { type: String, required: true },
  phone_number: { type: String, required: true },
  date_of_birth: { type: Date, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  address: { type: String, required: true },
  program: { type: String, required: true },
  previous_school: { type: String },
  previous_qualification: { type: String },
  guardian_name: { type: String },
  guardian_phone: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  admin_notes: { type: String },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approved_at: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Application', applicationSchema);
