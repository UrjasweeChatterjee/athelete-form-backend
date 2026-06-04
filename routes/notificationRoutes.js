// ─────────────────────────────────────────────────────────────
// routes/notificationRoutes.js  –  Notification Logs & Manual Send
//
// GET  /api/notifications/logs         – Coach/Admin: view all logs
// POST /api/notifications/send-manual  – Coach/Admin: send ad-hoc email
// POST /api/notifications/test-email   – Test SMTP configuration
// ─────────────────────────────────────────────────────────────

const express = require('express');
const db      = require('../db');
const { sendEmail } = require('../utils/notificationService');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /api/notifications/logs
// Returns all notification logs, newest first.
// Supports optional query params: ?limit=50&status=Failed
// ──────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(isNaN(parsedLimit) ? 100 : parsedLimit, 1), 500);
    const status = req.query.status; // optional filter: Sent | Failed | Pending

    let query  = 'SELECT * FROM notification_logs';
    const params = [];

    if (status && ['Sent', 'Failed', 'Pending'].includes(status)) {
      query  += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await db.execute(query, params);
    res.json({ logs: rows, total: rows.length });
  } catch (err) {
    console.error('Get notification logs error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/notifications/send-manual
// Coach/Admin: send a manual email to any recipient.
// Body: { to, subject, message }
// ──────────────────────────────────────────────────────────────
router.post('/send-manual', async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ message: 'to, subject, and message are required.' });
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }

    // Build HTML from plain-text message
    const html = `
      <div style="font-family:'Google Sans',Arial,sans-serif;max-width:600px;margin:auto;background:#0A0A12;color:#e2e4cf;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px 32px;border-bottom:2px solid #d4ff00;">
          <h2 style="margin:0;color:#d4ff00;font-size:1.2rem;letter-spacing:0.05em;">⚡ Sports Club Management</h2>
        </div>
        <div style="padding:32px;">
          ${message.replace(/\n/g, '<br/>')}
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:24px 0;" />
          <p style="color:rgba(197,201,172,0.5);font-size:0.8rem;margin:0;">
            This is a manual message sent by your coach/administrator.
          </p>
        </div>
      </div>
    `;

    const sent = await sendEmail(to, subject, html, {
      user_role:         'Admin',
      notification_type: 'Manual',
    });

    res.json({
      message: sent
        ? 'Email sent successfully and logged.'
        : 'Email failed to send. Check logs for details.',
      success: sent,
    });
  } catch (err) {
    console.error('Manual send error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/notifications/test-email
// Send a test email to verify SMTP configuration.
// Body: { to }   (optional — defaults to MAIL_USER)
// ──────────────────────────────────────────────────────────────
router.post('/test-email', async (req, res) => {
  try {
    const to = req.body.to || process.env.MAIL_USER;
    if (!to) {
      return res.status(400).json({ message: 'No test email recipient configured.' });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;background:#0A0A12;color:#e2e4cf;border-radius:12px;border:1px solid rgba(212,255,0,0.3);">
        <h2 style="color:#d4ff00;">✅ SMTP Test Successful</h2>
        <p>Your email configuration is working correctly.</p>
        <p style="color:rgba(197,201,172,0.6);font-size:0.85rem;">Sent at: ${new Date().toISOString()}</p>
      </div>
    `;

    const sent = await sendEmail(to, '✅ SMTP Test – Sports Club Management', html, {
      user_role:         'Admin',
      notification_type: 'TestEmail',
    });

    res.json({
      message: sent ? `Test email sent to ${to}.` : 'SMTP test failed. Check server logs.',
      success: sent,
    });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
