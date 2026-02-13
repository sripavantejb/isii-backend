const mongoose = require('mongoose');

// Reports for the "Perspectives" section
// NOTE: Intentionally mirrors the Article schema 1:1 as requested
const reportSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true,
  },
  date: {
    type: String,
    required: [true, 'Please provide a date'],
  },
  imageUrl: {
    type: String,
    default: '',
  },
  bannerImageUrl: {
    type: String,
    default: '',
  },
  pdfUrl: {
    type: String,
    required: [true, 'Please provide a PDF URL'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Report', reportSchema);
