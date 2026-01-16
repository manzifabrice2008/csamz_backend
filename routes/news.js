const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken: authMiddleware } = require('../middleware/auth');

const parseImageUrls = (rawValue) => {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.filter((url) => typeof url === 'string' && url.trim() !== '');
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.filter((url) => typeof url === 'string' && url.trim() !== '');
      }
    } catch (error) {
      // In older records image_url may store just a single string; fall back gracefully
      if (rawValue.trim().length > 0) {
        return [rawValue.trim()];
      }
    }
  }

  return [];
};

const formatArticle = (article) => {
  const parsedImageUrls = parseImageUrls(article.image_urls);
  const normalizedImageUrls = parsedImageUrls.length
    ? parsedImageUrls
    : parseImageUrls(article.image_url);

  const primaryImage = normalizedImageUrls[0] || article.image_url || '';

  return {
    ...article,
    image_url: primaryImage,
    image_urls: normalizedImageUrls
  };
};

// Get all news articles (public)
router.get('/', async (req, res) => {
  try {
    const [articles] = await db.query(`
      SELECT 
        n.*,
        a.username as author_username,
        a.full_name as author_name
      FROM news_articles n
      LEFT JOIN admins a ON n.author_id = a.id
      ORDER BY n.published_date DESC, n.created_at DESC
    `);

    const formattedArticles = articles.map(formatArticle);

    res.json({
      success: true,
      count: formattedArticles.length,
      articles: formattedArticles
    });
  } catch (error) {
    console.error('Get articles error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching articles'
    });
  }
});

// Get single article by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const [articles] = await db.query(`
      SELECT 
        n.*,
        a.username as author_username,
        a.full_name as author_name
      FROM news_articles n
      LEFT JOIN admins a ON n.author_id = a.id
      WHERE n.id = ?
    `, [req.params.id]);

    if (articles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    res.json({
      success: true,
      article: formatArticle(articles[0])
    });
  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching article'
    });
  }
});

// Create new article (protected)
router.post('/',
  authMiddleware,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('excerpt').trim().notEmpty().withMessage('Excerpt is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('published_date').optional().isISO8601().withMessage('Valid published date is required'),
    body('image_urls').optional().isArray({ max: 5 }).withMessage('image_urls must be an array with up to 5 items'),
    body('image_urls.*').optional().isString().withMessage('Each image URL must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { title, excerpt, content, category, image_urls, published_date } = req.body;
      const author_id = req.user.id;

      // Use current date if published_date is not provided
      const finalPublishedDate = published_date || new Date().toISOString().split('T')[0];

      const imageArray = Array.isArray(image_urls)
        ? image_urls.filter((url) => typeof url === 'string' && url.trim() !== '')
        : [];
      const primaryImage = imageArray[0] || '';
      const imagesJson = JSON.stringify(imageArray);

      const [result] = await db.query(
        'INSERT INTO news_articles (title, excerpt, content, category, image_url, image_urls, author_id, published_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [title, excerpt, content || '', category, primaryImage, imagesJson, author_id, finalPublishedDate]
      );

      res.status(201).json({
        success: true,
        message: 'Article created successfully',
        article: {
          id: result.insertId,
          title,
          excerpt,
          content,
          category,
          image_url: primaryImage,
          image_urls: imageArray,
          published_date: finalPublishedDate
        }
      });
    } catch (error) {
      console.error('Create article error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while creating article',
        error: error.message
      });
    }
  }
);

// Update article (protected)
router.put('/:id',
  authMiddleware,
  [
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('excerpt').optional().trim().notEmpty().withMessage('Excerpt cannot be empty'),
    body('category').optional().trim().notEmpty().withMessage('Category cannot be empty'),
    body('published_date').optional().isDate().withMessage('Valid published date is required'),
    body('image_urls').optional().isArray({ max: 5 }).withMessage('image_urls must be an array with up to 5 items'),
    body('image_urls.*').optional().isString().withMessage('Each image URL must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { title, excerpt, content, category, image_urls, published_date } = req.body;
      const articleId = req.params.id;

      // Check if article exists
      const [existingArticle] = await db.query('SELECT * FROM news_articles WHERE id = ?', [articleId]);

      if (existingArticle.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }

      // Build update query dynamically
      const updates = [];
      const values = [];

      if (title) {
        updates.push('title = ?');
        values.push(title);
      }
      if (excerpt) {
        updates.push('excerpt = ?');
        values.push(excerpt);
      }
      if (content !== undefined) {
        updates.push('content = ?');
        values.push(content);
      }
      if (category) {
        updates.push('category = ?');
        values.push(category);
      }
      if (image_urls !== undefined) {
        const imageArray = Array.isArray(image_urls)
          ? image_urls.filter((url) => typeof url === 'string' && url.trim() !== '')
          : [];
        const primaryImage = imageArray[0] || '';

        updates.push('image_url = ?');
        values.push(primaryImage);

        updates.push('image_urls = ?');
        values.push(JSON.stringify(imageArray));
      }
      if (published_date) {
        updates.push('published_date = ?');
        values.push(published_date);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      values.push(articleId);

      await db.query(
        `UPDATE news_articles SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      res.json({
        success: true,
        message: 'Article updated successfully'
      });
    } catch (error) {
      console.error('Update article error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while updating article'
      });
    }
  }
);

// Delete article (protected)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const articleId = req.params.id;

    const [result] = await db.query('DELETE FROM news_articles WHERE id = ?', [articleId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    res.json({
      success: true,
      message: 'Article deleted successfully'
    });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting article'
    });
  }
});

module.exports = router;
