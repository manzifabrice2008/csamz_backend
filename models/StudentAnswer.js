const mongoose = require('mongoose');

const studentAnswerSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  question_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  answer: { type: String, required: true },
  is_correct: { type: Boolean, required: true }
}, { timestamps: true });

// Ensure a student has only one recorded answer per question
studentAnswerSchema.index({ student_id: 1, question_id: 1 }, { unique: true });

module.exports = mongoose.model('StudentAnswer', studentAnswerSchema);
