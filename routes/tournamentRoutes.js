// ─────────────────────────────────────────────────────────────
// routes/tournamentRoutes.js  –  Tournaments & Events API
// ─────────────────────────────────────────────────────────────
const express = require('express');
const db      = require('../db');
const router  = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /api/tournaments
// Returns all tournaments (Admin view)
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM tournaments ORDER BY event_date ASC'
    );
    res.json({ tournaments: rows });
  } catch (err) {
    console.error('Get tournaments error:', err);
    res.status(500).json({ message: 'Server error retrieving tournaments.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/tournaments/student/:studentId
// Returns all tournaments with registration/paid status for a specific athlete
// ─────────────────────────────────────────────────────────────
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // We join tournaments with payments to see if this student has paid for it
    const [rows] = await db.execute(
      `SELECT t.*, 
              p.payment_status, 
              p.id AS payment_id,
              p.receipt_url
       FROM tournaments t
       LEFT JOIN payments p ON p.tournament_id = t.id 
                            AND p.student_id = ? 
                            AND p.payment_status = 'Paid'
       ORDER BY t.event_date ASC`,
      [studentId]
    );
    
    res.json({ tournaments: rows });
  } catch (err) {
    console.error('Get student tournaments error:', err);
    res.status(500).json({ message: 'Server error retrieving tournaments.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/tournaments/create
// Creates a new tournament (Coach/Admin only)
// ─────────────────────────────────────────────────────────────
router.post('/create', async (req, res) => {
  try {
    const { name, sport, event_date, fee_amount, description } = req.body;
    
    if (!name || !sport || !event_date || !fee_amount) {
      return res.status(400).json({ message: 'Name, sport, event_date, and fee_amount are required.' });
    }
    
    const parsedFee = parseFloat(fee_amount);
    if (isNaN(parsedFee) || parsedFee < 0) {
      return res.status(400).json({ message: 'Fee amount must be a positive number.' });
    }

    const [result] = await db.execute(
      `INSERT INTO tournaments (name, sport, event_date, fee_amount, description)
       VALUES (?, ?, ?, ?, ?)`,
      [name, sport, event_date, parsedFee, description || null]
    );

    res.status(201).json({
      message: 'Tournament created successfully!',
      tournamentId: result.insertId,
    });
  } catch (err) {
    console.error('Create tournament error:', err);
    res.status(500).json({ message: 'Server error creating tournament.' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/tournaments/:id
// Deletes a tournament record
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM tournaments WHERE id = ?', [id]);
    res.json({ message: 'Tournament deleted successfully.' });
  } catch (err) {
    console.error('Delete tournament error:', err);
    res.status(500).json({ message: 'Server error deleting tournament.' });
  }
});

module.exports = router;
