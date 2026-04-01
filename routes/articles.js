const express = require('express');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const { protect } = require('../middleware/auth');
const { extractSlugFromUrl } = require('../utils/fileSlug');

const router = express.Router();

// @route   GET /api/articles
// @desc    Get all articles
// @access  Public
router.get('/', async (req, res) => {
  try {
    const articles = await Article.find();
    
    // Sort by date field (parsing "Month YYYY" format)
    // Latest dates first (descending order)
    articles.sort((a, b) => {
      const parseDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') {
          return new Date(0); // Invalid date - will be sorted to the end
        }
        
        try {
          // Parse "Month YYYY" format (e.g., "December 2025", "January 1990")
          const months = {
            'january': 0, 'february': 1, 'march': 2, 'april': 3,
            'may': 4, 'june': 5, 'july': 6, 'august': 7,
            'september': 8, 'october': 9, 'november': 10, 'december': 11
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
    
    res.json(articles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/articles/:id
// @desc    Get single article
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    
    res.json(article);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/articles
// @desc    Create new article
// @access  Private
router.post('/', protect, async (req, res, next) => {
  try {
    console.log('📝 POST /api/articles - Request received');
    console.log('   Request body:', JSON.stringify(req.body, null, 2));
    console.log('   MongoDB connection state:', mongoose.connection.readyState);

    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB is not connected. State:', mongoose.connection.readyState);
      return res.status(500).json({ 
        message: 'Database connection error',
        error: 'MongoDB is not connected. Please check your database connection.'
      });
    }

    const { title, date, imageUrl, bannerImageUrl, pdfUrl } = req.body;

    const missingFields = [];
    if (!title || title.trim() === '') missingFields.push('title');
    if (!date || date.trim() === '') missingFields.push('date');
    if (!pdfUrl || pdfUrl.trim() === '') missingFields.push('pdfUrl');

    if (missingFields.length > 0) {
      console.error('❌ Missing or empty required fields:', missingFields);
      return res.status(400).json({ 
        message: 'Please provide all fields',
        missing: missingFields
      });
    }

    console.log('📝 Creating article in database...');
    const article = await Article.create({
      title: title.trim(),
      date: date.trim(),
      imageUrl: imageUrl ? imageUrl.trim() : '',
      bannerImageUrl: bannerImageUrl ? bannerImageUrl.trim() : '',
      pdfUrl: pdfUrl.trim(),
      slug: extractSlugFromUrl(pdfUrl.trim()),
    });

    console.log('✅ Article created successfully:', { id: article._id });
    
    return res.status(201).json(article);
  } catch (error) {
    console.error('❌ Error creating article:', error);
    if (error?.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation error', errors: errors });
    }
    if (error?.code === 11000) {
      return res.status(400).json({ message: 'Duplicate entry', error: 'An article with this information already exists' });
    }
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (error?.message || 'Unknown error') });
    }
  }
});

// @route   PUT /api/articles/:id
// @desc    Update article
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, date, imageUrl, bannerImageUrl, pdfUrl } = req.body;
    const trimmedPdfUrl = typeof pdfUrl === 'string' ? pdfUrl.trim() : '';

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    article.title = title || article.title;
    article.date = date || article.date;
    article.imageUrl = imageUrl !== undefined ? imageUrl : article.imageUrl;
    article.bannerImageUrl = bannerImageUrl !== undefined ? bannerImageUrl : article.bannerImageUrl;
    article.pdfUrl = trimmedPdfUrl || article.pdfUrl;
    article.slug = trimmedPdfUrl ? extractSlugFromUrl(trimmedPdfUrl) : article.slug;
    article.updatedAt = Date.now();

    const updatedArticle = await article.save();

    res.json(updatedArticle);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/articles/:id
// @desc    Delete article
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    await article.deleteOne();

    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
