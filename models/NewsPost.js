const mongoose = require('mongoose');

const newsPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  excerpt: {
    type: String,
    required: true,
  },
  content: {
    type: String,
  },
  category: {
    type: String,
    required: true,
  },
  image_url: {
    type: String,
  },
  author_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  published_date: {
    type: Date,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('NewsPost', newsPostSchema);
