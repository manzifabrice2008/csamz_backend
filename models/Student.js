const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    unique: true,
    sparse: true, // allows multiple nulls if email is optional
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  full_name: {
    type: String,
    required: true,
  },
  trade: {
    type: String,
    required: true,
  },
  level: {
    type: String,
    enum: ['L3', 'L4', 'L5'],
    required: true,
    default: 'L3',
  },
  phone_number: {
    type: String,
    trim: true,
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
