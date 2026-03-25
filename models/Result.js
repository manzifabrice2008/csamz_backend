const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  exam_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  score: { type: Number, required: true },
  submitted_at: { type: Date, default: Date.now },
}, { timestamps: true });

// To ensure a student can only take an exam once (like the upsert conflict target)
resultSchema.index({ student_id: 1, exam_id: 1 }, { unique: true });

module.exports = mongoose.model('Result', resultSchema);
