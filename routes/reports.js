const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/reports
// @desc    Get all reports (Perspectives)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const reports = await Report.find();
    
    reports.sort((a, b) => {
      const parseDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return new Date(0);
        try {
          const months = { 'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5, 'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11 };
          const parts = dateStr.trim().toLowerCase().split(/\s+/);
          if (parts.length !== 2) return new Date(0);
          const month = months[parts[0]];
          const year = parseInt(parts[1], 10);
          if (month === undefined || isNaN(year)) return new Date(0);
          return new Date(year, month, 1);
        } catch { return new Date(0); }
      };
      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    
    res.json(reports);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/reports/:id
// @desc    Get single report
// @access  Public
router.get('/:id', async (req, res) => {
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