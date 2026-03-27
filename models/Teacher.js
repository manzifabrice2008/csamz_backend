const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  trade: { type: String, required: true },
  trades: [{ type: String }],
  level: { type: String, enum: ['L3', 'L4', 'L5'], required: true, default: 'L3' },
  levels: [{ type: String, enum: ['L3', 'L4', 'L5'] }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  last_seen_at: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Teacher', teacherSchema);
