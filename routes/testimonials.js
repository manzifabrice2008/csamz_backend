const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all approved testimonials (public)
router.get('/approved', async (req, res) => {
  try {
    const { data: testimonials, error } = await supabase
      .from('testimonials')
      .select('id, full_name, program, graduation_year, rating, testimonial_text, profile_image, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(testimonials);
  } catch (error) {
    console.error('Error fetching approved testimonials:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

// Submit a new testimonial (public)
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

    // Validation
    if (!full_name || !email || !program || !rating || !testimonial_text) {
      return res.status(400).json({
        error: 'Please provide all required fields: full_name, email, program, rating, and testimonial_text'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Insert testimonial
    const { data: result, error } = await supabase
      .from('testimonials')
      .insert([{
        full_name,
        email,
        phone_number,
        program,
        graduation_year,
        rating,
        testimonial_text,
        profile_image,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Testimonial submitted successfully! It will be reviewed by our admin team.',
      testimonial_id: result.id
    });
  } catch (error) {
    console.error('Error submitting testimonial:', error);
    res.status(500).json({ error: 'Failed to submit testimonial' });
  }
});

// Get all testimonials (admin only)
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const { data: testimonials, error } = await supabase
      .from('testimonials')
      .select('*, approved_by:admins(full_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedTestimonials = testimonials.map(t => ({
      ...t,
      approved_by_name: t.approved_by?.full_name || null,
      approved_by: t.approved_by ? undefined : null
    }));

    res.json(formattedTestimonials);
  } catch (error) {
    console.error('Error fetching all testimonials:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

// Get testimonials by status (admin only)
router.get('/status/:status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data: testimonials, error } = await supabase
      .from('testimonials')
      .select('*, approved_by:admins(full_name)')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedTestimonials = testimonials.map(t => ({
      ...t,
      approved_by_name: t.approved_by?.full_name || null,
      approved_by: t.approved_by ? undefined : null
    }));

    res.json(formattedTestimonials);
  } catch (error) {
    console.error('Error fetching testimonials by status:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

// Get single testimonial (admin only)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { data: testimonial, error } = await supabase
      .from('testimonials')
      .select('*, approved_by:admins(full_name)')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Testimonial not found' });
      }
      throw error;
    }

    const formattedTestimonial = {
      ...testimonial,
      approved_by_name: testimonial.approved_by?.full_name || null,
      approved_by: testimonial.approved_by ? undefined : null
    };

    res.json(formattedTestimonial);
  } catch (error) {
    console.error('Error fetching testimonial:', error);
    res.status(500).json({ error: 'Failed to fetch testimonial' });
  }
});

// Approve testimonial (admin only)
router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const adminId = req.user.id;

    const { error, count } = await supabase
      .from('testimonials')
      .update({
        status: 'approved',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        admin_notes: admin_notes || null
      })
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Testimonial approved successfully' });
  } catch (error) {
    console.error('Error approving testimonial:', error);
    res.status(500).json({ error: 'Failed to approve testimonial' });
  }
});

// Reject testimonial (admin only)
router.put('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    const adminId = req.user.id;

    const { error } = await supabase
      .from('testimonials')
      .update({
        status: 'rejected',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        admin_notes: admin_notes || null
      })
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Testimonial rejected' });
  } catch (error) {
    console.error('Error rejecting testimonial:', error);
    res.status(500).json({ error: 'Failed to reject testimonial' });
  }
});

// Delete testimonial (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { error, count } = await supabase
      .from('testimonials')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);

    if (error) throw error;
    if (count === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json({ message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error('Error deleting testimonial:', error);
    res.status(500).json({ error: 'Failed to delete testimonial' });
  }
});

// Get testimonial statistics (admin only)
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const { data: testimonials, error } = await supabase
      .from('testimonials')
      .select('status, rating');

    if (error) throw error;

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
