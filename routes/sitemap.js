const express = require('express');
const Article = require('../models/Article');
const Report = require('../models/Report');
const News = require('../models/News');
const { buildSitemapXml } = require('../utils/buildSitemap');

const router = express.Router();

// @route   GET /sitemap.xml
// @desc    Auto-generated sitemap: static pages + every article/report/news file
// @access  Public
router.get('/', async (req, res) => {
  try {
    const [articles, reports, news] = await Promise.all([
      Article.find().select('pdfUrl updatedAt createdAt').lean(),
      Report.find().select('pdfUrl updatedAt createdAt').lean(),
      News.find().select('articleFileUrl updatedAt createdAt').lean(),
    ]);

    const contentItems = [
      ...articles.map((a) => ({ url: a.pdfUrl, lastmod: a.updatedAt || a.createdAt })),
      ...reports.map((r) => ({ url: r.pdfUrl, lastmod: r.updatedAt || r.createdAt })),
      // News only contributes when it has an uploaded file on our domain;
      // external-link-only news resolves to null and is skipped.
      ...news.map((n) => ({ url: n.articleFileUrl, lastmod: n.updatedAt || n.createdAt })),
    ];

    const { xml } = buildSitemapXml(contentItems);

    res.set('Content-Type', 'application/xml; charset=utf-8');
    // Cache at the CDN/browser for an hour — crawlers don't need it real-time.
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).type('text/plain').send('Failed to generate sitemap');
  }
});

module.exports = router;
