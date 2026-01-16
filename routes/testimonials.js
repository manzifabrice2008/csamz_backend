const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all approved testimonials (public)
router.get('/approved', async (req, res) => {
  try {
    const [testimonials] = await db.query(
      `SELECT id, full_name, program, graduation_year, rating, testimonial_text, 
              profile_image, created_at 
       FROM testimonials 
       WHERE status = 'approved' 
       ORDER BY created_at DESC`
    );
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
    const [result] = await db.query(
      `INSERT INTO testimonials 
       (full_name, email, phone_number, program, graduation_year, rating, testimonial_text, profile_image, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [full_name, email, phone_number, program, graduation_year, rating, testimonial_text, profile_image]
    );

    res.status(201).json({
      message: 'Testimonial submitted successfully! It will be reviewed by our admin team.',
      testimonial_id: result.insertId
    });
  } catch (error) {
    console.error('Error submitting testimonial:', error);
    res.status(500).json({ error: 'Failed to submit testimonial' });
  }
});

// Get all testimonials (admin only)
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const [testimonials] = await db.query(
      `SELECT t.*, a.full_name as approved_by_name
       FROM testimonials t
       LEFT JOIN admins a ON t.approved_by = a.id
       ORDER BY t.created_at DESC`
    );
    res.json(testimonials);
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

    const [testimonials] = await db.query(
      `SELECT t.*, a.full_name as approved_by_name
       FROM testimonials t
       LEFT JOIN admins a ON t.approved_by = a.id
       WHERE t.status = ?
       ORDER BY t.created_at DESC`,
      [status]
    );
    res.json(testimonials);
  } catch (error) {
    console.error('Error fetching testimonials by status:', error);
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

// Get single testimonial (admin only)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [testimonials] = await db.query(
      `SELECT t.*, a.full_name as approved_by_name
       FROM testimonials t
       LEFT JOIN admins a ON t.approved_by = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (testimonials.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json(testimonials[0]);
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

    const [result] = await db.query(
      `UPDATE testimonials 
       SET status = 'approved', 
           approved_by = ?, 
           approved_at = NOW(),
           admin_notes = ?
       WHERE id = ?`,
      [adminId, admin_notes, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

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

    const [result] = await db.query(
      `UPDATE testimonials 
       SET status = 'rejected', 
           approved_by = ?, 
           approved_at = NOW(),
           admin_notes = ?
       WHERE id = ?`,
      [adminId, admin_notes, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }

    res.json({ message: 'Testimonial rejected' });
  } catch (error) {
    console.error('Error rejecting testimonial:', error);
    res.status(500).json({ error: 'Failed to reject testimonial' });
  }
});

// Delete testimonial (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query('DELETE FROM testimonials WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
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
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        AVG(CASE WHEN status = 'approved' THEN rating ELSE NULL END) as average_rating
      FROM testimonials
    `);

    res.json(stats[0]);
  } catch (error) {
    console.error('Error fetching testimonial stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
