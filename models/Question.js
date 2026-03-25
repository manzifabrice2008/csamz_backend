const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  exam_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  question_text: { type: String, required: true },
  type: { type: String, enum: ['MCQ', 'TF'], required: true },
  options: { type: String }, // Stored as JSON string to mirror existing data structure, or could rely on mixed type
  correct_answer: { type: String, required: true },
  marks: { type: Number, default: 1 },
  time_limit: { type: Number, default: 30 },
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);
