const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken: authMiddleware } = require('../middleware/auth');

const parseBoolean = (value, defaultValue = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return defaultValue;
};

// Helper to sanitize blog record
const mapBlogPost = (row) => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  excerpt: row.excerpt,
  content: row.content,
  cover_image: row.cover_image,
  author_id: row.author_id,
  author_name: row.author_name ?? row.author_full_name ?? null,
  published_date: row.published_date,
  is_published: Boolean(row.is_published),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// Public: list published blog posts
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.*, a.full_name AS author_name
       FROM blog_posts b
       LEFT JOIN admins a ON b.author_id = a.id
       WHERE b.is_published = TRUE
       ORDER BY b.published_date DESC, b.created_at DESC`
    );

    res.json({
      success: true,
      count: rows.length,
      posts: rows.map(mapBlogPost),
    });
  } catch (error) {
    console.error('List blog posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog posts',
    });
  }
});

// Admin: list all posts (including drafts)
router.get('/admin', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.*, a.full_name AS author_name
       FROM blog_posts b
       LEFT JOIN admins a ON b.author_id = a.id
       ORDER BY b.published_date DESC, b.created_at DESC`
    );

    res.json({
      success: true,
      count: rows.length,
      posts: rows.map(mapBlogPost),
    });
  } catch (error) {
    console.error('Admin list blog posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog posts',
    });
  }
});

// Admin: get by id
router.get('/admin/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.*, a.full_name AS author_name
       FROM blog_posts b
       LEFT JOIN admins a ON b.author_id = a.id
       WHERE b.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found',
      });
    }

    res.json({
      success: true,
      post: mapBlogPost(rows[0]),
    });
  } catch (error) {
    console.error('Admin get blog post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog post',
    });
  }
});

// Public: get by slug
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.*, a.full_name AS author_name
       FROM blog_posts b
       LEFT JOIN admins a ON b.author_id = a.id
       WHERE b.slug = ? AND b.is_published = TRUE`,
      [req.params.slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found',
      });
    }

    res.json({
      success: true,
      post: mapBlogPost(rows[0]),
    });
  } catch (error) {
    console.error('Get blog post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog post',
    });
  }
});

const blogValidators = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('slug').trim().notEmpty().withMessage('Slug is required'),
  body('excerpt').trim().notEmpty().withMessage('Excerpt is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('cover_image').optional().trim(),
  body('published_date').isISO8601().withMessage('Valid published date is required'),
  body('is_published').optional().isBoolean().withMessage('is_published must be boolean'),
];

// Admin: create blog post
router.post('/', authMiddleware, blogValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { title, slug, excerpt, content, cover_image, published_date, is_published } = req.body;
    const authorId = req.user?.id ?? null;

    const [result] = await db.query(
      `INSERT INTO blog_posts (title, slug, excerpt, content, cover_image, author_id, published_date, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        slug,
        excerpt,
        content,
        cover_image || null,
        authorId,
        published_date,
        parseBoolean(is_published, true) ? 1 : 0,
      ]
    );

    const [createdRows] = await db.query(
      `SELECT b.*, a.full_name AS author_name
       FROM blog_posts b
       LEFT JOIN admins a ON b.author_id = a.id
       WHERE b.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      post: mapBlogPost(createdRows[0]),
    });
  } catch (error) {
    console.error('Create blog post error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Slug already exists. Please choose a different slug.',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating blog post',
    });
  }
});

// Admin: update blog post
router.put('/:id', authMiddleware, blogValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const postId = req.params.id;
    const { title, slug, excerpt, content, cover_image, published_date, is_published } = req.body;

    const [existing] = await db.query('SELECT id FROM blog_posts WHERE id = ?', [postId]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found',
      });
    }

    await db.query(
      `UPDATE blog_posts
       SET title = ?, slug = ?, excerpt = ?, content = ?, cover_image = ?, published_date = ?, is_published = ?
       WHERE id = ?`,
      [
        title,
        slug,
        excerpt,
        content,
        cover_image || null,
        published_date,
        parseBoolean(is_published, true) ? 1 : 0,
        postId,
      ]
    );

    const [updatedRows] = await db.query(
      `SELECT b.*, a.full_name AS author_name
       FROM blog_posts b
       LEFT JOIN admins a ON b.author_id = a.id
       WHERE b.id = ?`,
      [postId]
    );

    res.json({
      success: true,
      message: 'Blog post updated successfully',
      post: mapBlogPost(updatedRows[0]),
    });
  } catch (error) {
    console.error('Update blog post error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Slug already exists. Please choose a different slug.',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating blog post',
    });
  }
});

// Admin: delete blog post
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const [existing] = await db.query('SELECT id FROM blog_posts WHERE id = ?', [postId]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found',
      });
    }

    await db.query('DELETE FROM blog_posts WHERE id = ?', [postId]);

    res.json({
      success: true,
      message: 'Blog post deleted successfully',
    });
  } catch (error) {
    console.error('Delete blog post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting blog post',
    });
  }
});

module.exports = router;
