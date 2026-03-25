const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  trade: { type: String, required: true },
  level: { type: String, enum: ['L1', 'L2', 'L3', 'L4', 'L5'] },
  deadline: { type: Date, required: true },
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  file_path: { type: String }, // uploaded material
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
