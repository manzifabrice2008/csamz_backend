const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  excerpt: { type: String, required: true },
  content: { type: String, required: true },
  cover_image: { type: String },
  author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  published_date: { type: Date, required: true },
  is_published: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('BlogPost', blogPostSchema);
