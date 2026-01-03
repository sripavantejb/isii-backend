const express = require('express');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/articles
// @desc    Get all articles
// @access  Public
router.get('/', async (req, res) => {
  try {
    const articles = await Article.find().sort({ createdAt: -1 });
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
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB is not connected. State:', mongoose.connection.readyState);
      return res.status(500).json({ 
        message: 'Database connection error',
        error: 'MongoDB is not connected. Please check your database connection.'
      });
    }

    const { title, date, imageUrl, pdfUrl } = req.body;

    // Validate required fields (check for empty strings too)
    const missingFields = [];
    if (!title || title.trim() === '') missingFields.push('title');
    if (!date || date.trim() === '') missingFields.push('date');
    if (!imageUrl || imageUrl.trim() === '') missingFields.push('imageUrl');
    if (!pdfUrl || pdfUrl.trim() === '') missingFields.push('pdfUrl');

    if (missingFields.length > 0) {
      console.error('❌ Missing or empty required fields:', missingFields);
      console.error('   Received data:', {
        title: title || '(empty)',
        date: date || '(empty)',
        imageUrl: imageUrl ? `${imageUrl.substring(0, 50)}...` : '(empty)',
        pdfUrl: pdfUrl ? `${pdfUrl.substring(0, 50)}...` : '(empty)',
      });
      return res.status(400).json({ 
        message: 'Please provide all fields',
        missing: missingFields
      });
    }

    console.log('📝 Creating article in database...');
    console.log('   Article data:', {
      title: title.substring(0, 50),
      date,
      imageUrl: imageUrl.substring(0, 80),
      pdfUrl: pdfUrl.substring(0, 80),
    });

    const article = await Article.create({
      title: title.trim(),
      date: date.trim(),
      imageUrl: imageUrl.trim(),
      pdfUrl: pdfUrl.trim(),
    });

    console.log('✅ Article created successfully:', {
      id: article._id,
      title: article.title,
      date: article.date,
    });
    
    return res.status(201).json(article);
  } catch (error) {
    console.error('❌ Error creating article:', error);
    console.error('   Error name:', error?.name);
    console.error('   Error message:', error?.message);
    console.error('   Error stack:', error?.stack);
    
    // Handle Mongoose validation errors
    if (error?.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error',
        errors: errors
      });
    }

    // Handle duplicate key errors
    if (error?.code === 11000) {
      return res.status(400).json({ 
        message: 'Duplicate entry',
        error: 'An article with this information already exists'
      });
    }

    // If response hasn't been sent, send error response
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: 'Server error',
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (error?.message || 'Unknown error')
      });
    }
  }
});

// @route   PUT /api/articles/:id
// @desc    Update article
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, date, imageUrl, pdfUrl } = req.body;

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    article.title = title || article.title;
    article.date = date || article.date;
    article.imageUrl = imageUrl || article.imageUrl;
    article.pdfUrl = pdfUrl || article.pdfUrl;
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

