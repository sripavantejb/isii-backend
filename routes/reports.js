const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/reports
// @desc    Get all reports
// @access  Public
router.get('/', async (req, res) => {
  try {
    const reports = await Report.find();

    // Sort by date field (parsing "Month YYYY" format)
    // Latest dates first (descending order)
    reports.sort((a, b) => {
      const parseDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') {
          return new Date(0); // Invalid date - will be sorted to the end
        }

        try {
          // Parse "Month YYYY" format (e.g., "December 2025", "January 1990")
          const months = {
            january: 0,
            february: 1,
            march: 2,
            april: 3,
            may: 4,
            june: 5,
            july: 6,
            august: 7,
            september: 8,
            october: 9,
            november: 10,
            december: 11,
          };

          const trimmed = dateStr.trim().toLowerCase();
          const parts = trimmed.split(/\s+/);

          if (parts.length !== 2) {
            return new Date(0); // Invalid format
          }

          const monthName = parts[0];
          const month = months[monthName];
          const year = parseInt(parts[1], 10);

          if (month === undefined || isNaN(year) || year < 1900 || year > 2100) {
            return new Date(0); // Invalid month or year
          }

          return new Date(year, month, 1);
        } catch (error) {
          return new Date(0); // Return epoch for invalid dates
        }
      };

      const dateA = parseDate(a.date);
      const dateB = parseDate(b.date);

      // Sort descending (newest first)
      // Invalid dates (epoch) will be sorted to the end
      if (dateA.getTime() === 0 && dateB.getTime() === 0) return 0;
      if (dateA.getTime() === 0) return 1; // Invalid dates go to end
      if (dateB.getTime() === 0) return -1; // Valid dates come first

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

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

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
    console.log('📝 POST /api/reports - Request received');
    console.log('   Request body:', JSON.stringify(req.body, null, 2));
    console.log('   MongoDB connection state:', mongoose.connection.readyState);

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB is not connected. State:', mongoose.connection.readyState);
      return res.status(500).json({
        message: 'Database connection error',
        error: 'MongoDB is not connected. Please check your database connection.',
      });
    }

    const { title, date, imageUrl, bannerImageUrl, pdfUrl } = req.body;

    // Validate required fields (check for empty strings too)
    const missingFields = [];
    if (!title || title.trim() === '') missingFields.push('title');
    if (!date || date.trim() === '') missingFields.push('date');
    if (!pdfUrl || pdfUrl.trim() === '') missingFields.push('pdfUrl');

    if (missingFields.length > 0) {
      console.error('❌ Missing or empty required fields:', missingFields);
      console.error('   Received data:', {
        title: title || '(empty)',
        date: date || '(empty)',
        imageUrl: imageUrl ? `${imageUrl.substring(0, 50)}...` : '(empty)',
        bannerImageUrl: bannerImageUrl ? `${bannerImageUrl.substring(0, 50)}...` : '(empty)',
        pdfUrl: pdfUrl ? `${pdfUrl.substring(0, 50)}...` : '(empty)',
      });
      return res.status(400).json({
        message: 'Please provide all fields',
        missing: missingFields,
      });
    }

    console.log('📝 Creating report in database...');
    console.log('   Report data:', {
      title: title.substring(0, 50),
      date,
      imageUrl: imageUrl ? imageUrl.substring(0, 80) : '(empty)',
      bannerImageUrl: bannerImageUrl ? bannerImageUrl.substring(0, 80) : '(empty)',
      pdfUrl: pdfUrl.substring(0, 80),
    });

    const report = await Report.create({
      title: title.trim(),
      date: date.trim(),
      imageUrl: imageUrl ? imageUrl.trim() : '',
      bannerImageUrl: bannerImageUrl ? bannerImageUrl.trim() : '',
      pdfUrl: pdfUrl.trim(),
    });

    console.log('✅ Report created successfully:', {
      id: report._id,
      title: report.title,
      date: report.date,
    });

    return res.status(201).json(report);
  } catch (error) {
    console.error('❌ Error creating report:', error);
    console.error('   Error name:', error?.name);
    console.error('   Error message:', error?.message);
    console.error('   Error stack:', error?.stack);

    // Handle Mongoose validation errors
    if (error?.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        message: 'Validation error',
        errors: errors,
      });
    }

    // Handle duplicate key errors
    if (error?.code === 11000) {
      return res.status(400).json({
        message: 'Duplicate entry',
        error: 'A report with this information already exists',
      });
    }

    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (error?.message || 'Unknown error'),
    });
  }
});

// @route   PUT /api/reports/:id
// @desc    Update report
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, date, imageUrl, bannerImageUrl, pdfUrl } = req.body;

    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

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

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    await report.deleteOne();

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
