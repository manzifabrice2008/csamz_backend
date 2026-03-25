const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  current_institution: { type: String, required: true },
  target_institution: { type: String, required: true },
  reason: { type: String, required: true },
  witness_document_path: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  admin_notes: { type: String },
  processed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  processed_at: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Transfer', transferSchema);
