const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  email: { type: String, required: true },
  phone_number: { type: String },
  program: { type: String, required: true },
  graduation_year: { type: String },
  rating: { type: Number, required: true, min: 1, max: 5 },
  testimonial_text: { type: String, required: true },
  profile_image: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  admin_notes: { type: String },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approved_at: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Testimonial', testimonialSchema);
