const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  file_path: { type: String }, // optional, for upload
  notes: { type: String }, 
  grade: { type: Number, min: 0, max: 100 },
  feedback: { type: String },
  submitted_at: { type: Date, default: Date.now },
  graded_at: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Submission', submissionSchema);
