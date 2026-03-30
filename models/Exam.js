const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: { type: String, required: true },
  exam_code: { type: String, unique: true },
  description: { type: String },
  total_marks: { type: Number, default: 0 },
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  trade: { type: String, required: true },
  level: { type: String, enum: ['L1', 'L2', 'L3', 'L4', 'L5'] },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  grades_published_at: { type: Date, default: null },
  grades_published_by: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);
