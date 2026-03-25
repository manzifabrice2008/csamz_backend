const mongoose = require('mongoose');

const siteAnalyticsSchema = new mongoose.Schema({
  page_path: { type: String, required: true },
  visited_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster time-based queries
siteAnalyticsSchema.index({ visited_at: 1 });

module.exports = mongoose.model('SiteAnalytics', siteAnalyticsSchema);
