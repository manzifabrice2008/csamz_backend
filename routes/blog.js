const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const BlogPost = require('../models/BlogPost');
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

const mapBlogPost = (row) => ({
  id: row._id,
  title: row.title,
  slug: row.slug,
  excerpt: row.excerpt,
  content: row.content,
  cover_image: row.cover_image,
  author_id: typeof row.author_id === 'object' ? row.author_id._id : row.author_id,
  author_name: row.author_id?.full_name || null,
  published_date: row.published_date,
  is_published: Boolean(row.is_published),
  created_at: row.createdAt,
  updated_at: row.updatedAt,
});

router.get('/', async (req, res) => {
  try {
    const posts = await BlogPost.find({ is_published: true })
      .populate('author_id', 'full_name')
      .sort({ published_date: -1 })
      .lean();

    res.json({
      success: true,
      count: posts.length,
      posts: posts.map(mapBlogPost),
    });
  } catch (error) {
    console.error('List blog posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog posts',
    });
  }
});

router.get('/admin', authMiddleware, async (req, res) => {
  try {
    const posts = await BlogPost.find()
      .populate('author_id', 'full_name')
      .sort({ published_date: -1 })
      .lean();

    res.json({
      success: true,
      count: posts.length,
      posts: posts.map(mapBlogPost),
    });
  } catch (error) {
    console.error('Admin list blog posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog posts',
    });
  }
});

router.get('/admin/:id', authMiddleware, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id)
      .populate('author_id', 'full_name')
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    res.json({
      success: true,
      post: mapBlogPost(post),
    });
  } catch (error) {
    console.error('Admin get blog post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blog post',
    });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, is_published: true })
      .populate('author_id', 'full_name')
      .lean();

    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    res.json({
      success: true,
      post: mapBlogPost(post),
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

    const existing = await BlogPost.findOne({ slug });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Slug already exists. Please choose a different slug.',
      });
    }

    const newPost = await BlogPost.create({
      title,
      slug,
      excerpt,
      content,
      cover_image: cover_image || null,
      author_id: authorId,
      published_date,
      is_published: parseBoolean(is_published, true)
    });

    const populatedPost = await BlogPost.findById(newPost._id).populate('author_id', 'full_name').lean();

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      post: mapBlogPost(populatedPost),
    });
  } catch (error) {
    console.error('Create blog post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating blog post',
    });
  }
});

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

    const existing = await BlogPost.findOne({ slug, _id: { $ne: postId } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Slug already exists. Please choose a different slug.',
      });
    }

    const updatedPost = await BlogPost.findByIdAndUpdate(postId, {
      title,
      slug,
      excerpt,
      content,
      cover_image: cover_image || null,
      published_date,
      is_published: parseBoolean(is_published, true)
    }, { new: true }).populate('author_id', 'full_name').lean();

    if (!updatedPost) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    res.json({
      success: true,
      message: 'Blog post updated successfully',
      post: mapBlogPost(updatedPost),
    });
  } catch (error) {
    console.error('Update blog post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating blog post',
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deletedPost = await BlogPost.findByIdAndDelete(req.params.id);

    if (!deletedPost) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found',
      });
    }

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
