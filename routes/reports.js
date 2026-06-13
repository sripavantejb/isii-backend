const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const { protect } = require('../middleware/auth');
const { publicCache } = require('../utils/httpCache');

const router = express.Router();

// @route   GET /api/reports
// @desc    Get all reports (Perspectives)
// @access  Public
router.get('/', publicCache(), async (req, res) => {
  try {
    // Sorted by the database using the indexed sortDate (newest first).
    // Records with an unparseable date (sortDate = null) sort to the end.
    // .lean() returns plain objects for a faster, lighter response.
    const reports = await Report.find()
      .sort({ sortDate: -1, createdAt: -1 })
      .lean();

    res.json(reports);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/:id
// @desc    Get single report
// @access  Public
router.get('/:id', publicCache(), async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/reports
// @desc    Create new report
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    const { title, date, imageUrl, bannerImageUrl, pdfUrl } = req.body;

    if (!title || !date || !pdfUrl) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const report = await Report.create({
      title: title.trim(),
      date: date.trim(),
      imageUrl: imageUrl ? imageUrl.trim() : '',
      bannerImageUrl: bannerImageUrl ? bannerImageUrl.trim() : '',
      pdfUrl: pdfUrl.trim(),
    });

    return res.status(201).json(report);
  } catch (error) {
    console.error('Error creating report:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/reports/:id
// @desc    Update report
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, date, imageUrl, bannerImageUrl, pdfUrl } = req.body;
    const report = await Report.findById(req.params.id);

    if (!report) return res.status(404).json({ message: 'Report not found' });

    report.title = title || report.title;
    report.date = date || report.date;
    report.imageUrl = imageUrl !== undefined ? imageUrl : report.imageUrl;
    report.bannerImageUrl = bannerImageUrl !== undefined ? bannerImageUrl : report.bannerImageUrl;
    report.pdfUrl = pdfUrl || report.pdfUrl;
    report.updatedAt = Date.now();

    const updatedReport = await report.save();
    res.json(updatedReport);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/reports/:id
// @desc    Delete report
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    await report.deleteOne();
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;