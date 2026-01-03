const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
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
    required: [true, 'Please provide an image URL'],
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

module.exports = mongoose.model('Article', articleSchema);

