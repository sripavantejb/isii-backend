const mongoose = require('mongoose');
const { parseMonthYearToDate } = require('../utils/parseContentDate');

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
  // Real Date derived from the human `date` string ("December 2025"), used only
  // for fast indexed sorting in the database. The `date` string remains the
  // source of truth for display.
  sortDate: {
    type: Date,
    default: null,
    index: true,
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

// Keep sortDate in sync whenever the display date changes (runs on create and save).
reportSchema.pre('save', function () {
  if (this.isModified('date')) {
    this.sortDate = parseMonthYearToDate(this.date);
  }
});

module.exports = mongoose.model('Report', reportSchema);