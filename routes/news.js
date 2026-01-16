const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/database');
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
      if (rawValue.trim().length > 0) {
        return [rawValue.trim()];
      }
    }
  }

  return [];
};

const formatArticle = (article) => {
  // Supabase join returns author as an object
  const author_username = article.author?.username || null;
  const author_name = article.author?.full_name || null;

  const parsedImageUrls = parseImageUrls(article.image_urls);
  const normalizedImageUrls = parsedImageUrls.length
    ? parsedImageUrls
    : parseImageUrls(article.image_url);

  const primaryImage = normalizedImageUrls[0] || article.image_url || '';

  return {
    ...article,
    author_username,
    author_name,
    image_url: primaryImage,
    image_urls: normalizedImageUrls,
    author: undefined // Clean up join object
  };
};

// Get all news articles (public)
router.get('/', async (req, res) => {
  try {
    const { data: articles, error } = await supabase
      .from('news_articles')
      .select('*, author:admins(username, full_name)')
      .order('published_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

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
    const { data: articles, error } = await supabase
      .from('news_articles')
      .select('*, author:admins(username, full_name)')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }
      throw error;
    }

    res.json({
      success: true,
      article: formatArticle(articles)
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
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { title, excerpt, content, category, image_urls, published_date } = req.body;
      const author_id = req.user.id;
      const finalPublishedDate = published_date || new Date().toISOString().split('T')[0];

      const imageArray = Array.isArray(image_urls)
        ? image_urls.filter((url) => typeof url === 'string' && url.trim() !== '')
        : [];
      const primaryImage = imageArray[0] || '';

      const { data, error } = await supabase
        .from('news_articles')
        .insert([{
          title,
          excerpt,
          content: content || '',
          category,
          image_url: primaryImage,
          image_urls: JSON.stringify(imageArray),
          author_id,
          published_date: finalPublishedDate
        }])
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'Article created successfully',
        article: {
          ...data,
          image_urls: imageArray
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

      const updateData = {};
      if (title) updateData.title = title;
      if (excerpt) updateData.excerpt = excerpt;
      if (content !== undefined) updateData.content = content;
      if (category) updateData.category = category;
      if (image_urls !== undefined) {
        const imageArray = Array.isArray(image_urls)
          ? image_urls.filter((url) => typeof url === 'string' && url.trim() !== '')
          : [];
        updateData.image_url = imageArray[0] || '';
        updateData.image_urls = JSON.stringify(imageArray);
      }
      if (published_date) updateData.published_date = published_date;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      const { data, error } = await supabase
        .from('news_articles')
        .update(updateData)
        .eq('id', articleId)
        .select();

      if (error) throw error;
      if (data.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }

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
    const { error, count } = await supabase
      .from('news_articles')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);

    if (error) throw error;
    if (count === 0) {
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
