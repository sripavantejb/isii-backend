const express = require('express');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const { protect } = require('../middleware/auth');
const { extractSlugFromUrl } = require('../utils/fileSlug');
const { publicCache } = require('../utils/httpCache');

const router = express.Router();

// @route   GET /api/articles
// @desc    Get all articles
// @access  Public
router.get('/', publicCache(), async (req, res) => {
  try {
    // Sorted by the database using the indexed sortDate (newest first).
    // Records with an unparseable date (sortDate = null) sort to the end.
    // .lean() returns plain objects for a faster, lighter response.
    const articles = await Article.find()
      .sort({ sortDate: -1, createdAt: -1 })
      .lean();

    res.json(articles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/articles/:id
// @desc    Get single article
// @access  Public
router.get('/:id', publicCache(), async (req, res) => {
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
