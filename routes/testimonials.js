const express = require('express');
const router = express.Router();
const Testimonial = require('../models/Testimonial');
const { authenticateToken } = require('../middleware/auth');

router.get('/approved', async (req, res) => {
  try {
    const testimonials = await Testimonial.find({ status: 'approved' })
      .select('_id full_name program graduation_year rating testimonial_text profile_image createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = testimonials.map(t => ({
      id: t._id,
      ...t,
      created_at: t.createdAt
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching approved testimonials:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

router.post('/submit', async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone_number,
      program,
      graduation_year,
      rating,
      testimonial_text,
      profile_image
    } = req.body;

    if (!full_name || !email || !program || !rating || !testimonial_text) {
      return res.status(400).json({
        error: 'Please provide all required fields: full_name, email, program, rating, and testimonial_text'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const test = await Testimonial.create({
      full_name,
      email,
      phone_number,
      program,
      graduation_year,
      rating,
      testimonial_text,
      profile_image,
      status: 'pending'
    });

    res.status(201).json({
      message: 'Testimonial submitted successfully! It will be reviewed by our admin team.',
      testimonial_id: test._id
    });
  } catch (error) {
    console.error('Error submitting testimonial:', error);
    res.status(500).json({ error: 'Failed to submit testimonial' });
  }
});

router.get('/all', authenticateToken, async (req, res) => {
  try {
    const testimonials = await Testimonial.find()
      .populate('approved_by', 'full_name')
      .sort({ createdAt: -1 })
      .lean();

    const formattedTestimonials = testimonials.map(t => ({
      id: t._id,
      ...t,
      approved_by_name: t.approved_by?.full_name || null,
      approved_by: t.approved_by ? undefined : null,
      created_at: t.createdAt
    }));

    res.json(formattedTestimonials);
  } catch (error) {
    console.error('Error fetching all testimonials:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

router.get('/status/:status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const testimonials = await Testimonial.find({ status })
      .populate('approved_by', 'full_name')
      .sort({ createdAt: -1 })
      .lean();

    const formattedTestimonials = testimonials.map(t => ({
      id: t._id,
      ...t,
      approved_by_name: t.approved_by?.full_name || null,
      approved_by: t.approved_by ? undefined : null,
      created_at: t.createdAt
    }));

    res.json(formattedTestimonials);
  } catch (error) {
    console.error('Error fetching testimonials by status:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id)
      .populate('approved_by', 'full_name')
      .lean();

    if (!testimonial) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    const formattedTestimonial = {
      id: testimonial._id,
      ...testimonial,
      approved_by_name: testimonial.approved_by?.full_name || null,
      approved_by: testimonial.approved_by ? undefined : null,
      created_at: testimonial.createdAt
    };

    res.json(formattedTestimonial);
  } catch (error) {
    console.error('Error fetching testimonial:', error);
    res.status(500).json({ error: 'Failed to fetch testimonial' });
  }
});

router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const adminId = req.user.id;

    const testimonial = await Testimonial.findByIdAndUpdate(id, {
      status: 'approved',
      approved_by: adminId,
      approved_at: new Date(),
      admin_notes: admin_notes || null
    });

    if (!testimonial) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json({ message: 'Testimonial approved successfully' });
  } catch (error) {
    console.error('Error approving testimonial:', error);
    res.status(500).json({ error: 'Failed to approve testimonial' });
  }
});

router.put('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const adminId = req.user.id;

    const testimonial = await Testimonial.findByIdAndUpdate(id, {
      status: 'rejected',
      approved_by: adminId,
      approved_at: new Date(),
      admin_notes: admin_notes || null
    });

    if (!testimonial) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json({ message: 'Testimonial rejected' });
  } catch (error) {
    console.error('Error rejecting testimonial:', error);
    res.status(500).json({ error: 'Failed to reject testimonial' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const deletedTestimonial = await Testimonial.findByIdAndDelete(req.params.id);

    if (!deletedTestimonial) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json({ message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error('Error deleting testimonial:', error);
    res.status(500).json({ error: 'Failed to delete testimonial' });
  }
});

router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const testimonials = await Testimonial.find().select('status rating').lean();

    const approvedTestimonials = testimonials.filter(t => t.status === 'approved');
    const totalRating = approvedTestimonials.reduce((sum, t) => sum + t.rating, 0);

    const stats = {
      total: testimonials.length,
      pending: testimonials.filter(t => t.status === 'pending').length,
      approved: approvedTestimonials.length,
      rejected: testimonials.filter(t => t.status === 'rejected').length,
      average_rating: approvedTestimonials.length > 0 ? totalRating / approvedTestimonials.length : 0
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching testimonial stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
