const express = require('express');
const mongoose = require('mongoose');
const News = require('../models/News');
const { protect } = require('../middleware/auth');
const { extractSlugFromUrl } = require('../utils/fileSlug');

const router = express.Router();

const normalizeNewsPayload = (payload = {}) => {
  const publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : null;

  return {
    title: typeof payload.title === 'string' ? payload.title.trim() : '',
    description:
      typeof payload.description === 'string' ? payload.description.trim() : '',
    imageUrl: typeof payload.imageUrl === 'string' ? payload.imageUrl.trim() : '',
    articleURL:
      typeof payload.articleURL === 'string' ? payload.articleURL.trim() : '',
    articleFileUrl:
      typeof payload.articleFileUrl === 'string' ? payload.articleFileUrl.trim() : '',
    slug:
      typeof payload.articleFileUrl === 'string' && payload.articleFileUrl.trim()
        ? extractSlugFromUrl(payload.articleFileUrl.trim())
        : '',
    publishedAt,
  };
};

const validateNewsPayload = (payload) => {
  const errors = [];
  let message = '';

  if (!payload.title) errors.push('title');
  if (!payload.description) errors.push('description');
  if (!payload.imageUrl) errors.push('imageUrl');
  if (!payload.articleURL && !payload.articleFileUrl) {
    errors.push('readMoreTarget');
    message = 'Please provide either an external article URL or an uploaded file';
  }
  if (payload.articleURL && payload.articleFileUrl) {
    errors.push('readMoreTarget');
    message = 'Please choose either an external article URL or an uploaded file, not both';
  }
  if (!(payload.publishedAt instanceof Date) || Number.isNaN(payload.publishedAt.getTime())) {
    errors.push('publishedAt');
    if (!message) {
      message = 'Please provide all required fields';
    }
  }

  return {
    errors,
    message: message || 'Please provide all required fields',
  };
};

// @route   GET /api/news
// @desc    Get all news
// @access  Public
router.get('/', async (req, res) => {
  try {
    const newsItems = await News.find().sort({ publishedAt: -1, createdAt: -1 });
    res.json(newsItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/news/:id
// @desc    Get single news item
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);

    if (!newsItem) {
      return res.status(404).json({ message: 'News item not found' });
    }

    res.json(newsItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/news
// @desc    Create news item
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    const normalizedPayload = normalizeNewsPayload(req.body);
    const validationResult = validateNewsPayload(normalizedPayload);

    if (validationResult.errors.length > 0) {
      return res.status(400).json({
        message: validationResult.message,
        missing: validationResult.errors,
      });
    }

    const newsItem = await News.create(normalizedPayload);
    return res.status(201).json(newsItem);
  } catch (error) {
    console.error('Error creating news item:', error);
    if (error?.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/news/:id
// @desc    Update news item
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);

    if (!newsItem) {
      return res.status(404).json({ message: 'News item not found' });
    }

    const normalizedPayload = normalizeNewsPayload(req.body);
    const validationResult = validateNewsPayload(normalizedPayload);

    if (validationResult.errors.length > 0) {
      return res.status(400).json({
        message: validationResult.message,
        missing: validationResult.errors,
      });
    }

    newsItem.title = normalizedPayload.title;
    newsItem.description = normalizedPayload.description;
    newsItem.imageUrl = normalizedPayload.imageUrl;
    newsItem.articleURL = normalizedPayload.articleURL;
    newsItem.articleFileUrl = normalizedPayload.articleFileUrl;
    newsItem.slug = normalizedPayload.slug;
    newsItem.publishedAt = normalizedPayload.publishedAt;

    const updatedNewsItem = await newsItem.save();
    res.json(updatedNewsItem);
  } catch (error) {
    console.error(error);
    if (error?.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: 'Validation error', errors });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/news/:id
// @desc    Delete news item
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);

    if (!newsItem) {
      return res.status(404).json({ message: 'News item not found' });
    }

    await newsItem.deleteOne();
    res.json({ message: 'News item deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
