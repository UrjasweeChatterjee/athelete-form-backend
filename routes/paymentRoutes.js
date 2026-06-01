// ─────────────────────────────────────────────────────────────
// routes/paymentRoutes.js  –  Razorpay Payment APIs
//
// POST /api/payments/create-order   – Create Razorpay order
// POST /api/payments/verify         – Verify payment signature
// POST /api/payments/failed         – Mark payment as failed
// GET  /api/payments/student/:id    – Student payment history
// GET  /api/payments/admin/all      – Admin: all payments
// GET  /api/payments/admin/export   – Admin: export CSV
// GET  /api/payments/receipt/:id    – Download receipt PDF
// ─────────────────────────────────────────────────────────────

const express   = require('express');
const crypto    = require('crypto');
const path      = require('path');
const fs        = require('fs');
const Razorpay  = require('razorpay');
const db        = require('../db');
const { generateReceipt }           = require('../utils/receiptGenerator');
const { sendPaymentSuccessEmail,
        sendPaymentFailedEmail }     = require('../utils/notificationService');

const router = express.Router();

// ── Sandbox Check: automatic fallback when keys are placeholders ──
const isSandbox = !process.env.RAZORPAY_KEY_ID || 
                  process.env.RAZORPAY_KEY_ID.includes('XXXX') ||
                  !process.env.RAZORPAY_KEY_SECRET ||
                  process.env.RAZORPAY_KEY_SECRET.includes('XXXX');

if (isSandbox) {
  console.log('⚡  Payments Module running in LOCAL SANDBOX / MOCK MODE');
}

// ── Razorpay instance ─────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXXXXXXXXX',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'XXXXXXXXXXXXXXXXXXXXXXXX',
});

// ── Helper: get student by id ─────────────────────────────────
const getStudent = async (studentId) => {
  const [rows] = await db.execute(
    'SELECT id, full_name, email, mobile FROM students WHERE id = ?',
    [studentId]
  );
  return rows[0] || null;
};

// ──────────────────────────────────────────────────────────────
// POST /api/payments/create-order
// Creates a Razorpay order and a Pending payment record.
//
// ⚠️  PRODUCTION NOTE: Never trust the amount from the frontend.
// In production, fetch the fee amount from a competitions /
// settings table and ignore what the client sends.
// ──────────────────────────────────────────────────────────────
router.post('/create-order', async (req, res) => {
  try {
    const { student_id, competition_name, fee_type, amount, tournament_id } = req.body;

    // ── Validate inputs ───────────────────────────────────────
    if (!student_id || !amount) {
      return res.status(400).json({ message: 'student_id and amount are required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number.' });
    }

    const validFeeTypes = ['Registration Fee', 'Competition Fee'];
    const finalFeeType  = validFeeTypes.includes(fee_type) ? fee_type : 'Competition Fee';

    // ── Verify student exists ────────────────────────────────
    const student = await getStudent(student_id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // ── Create Razorpay order ────────────────────────────────
    // Razorpay accepts amount in paise (1 INR = 100 paise)
    let razorpayOrder;
    if (isSandbox) {
      razorpayOrder = {
        id: `order_mock_${Date.now()}`,
        amount: Math.round(parsedAmount * 100),
        currency: 'INR',
      };
    } else {
      razorpayOrder = await razorpay.orders.create({
        amount:   Math.round(parsedAmount * 100),
        currency: 'INR',
        receipt:  `scm_rcpt_${Date.now()}`,
        notes: {
          student_id:       String(student_id),
          competition_name: competition_name || '',
          fee_type:         finalFeeType,
          tournament_id:    tournament_id ? String(tournament_id) : '',
        },
      });
    }

    // ── Insert Pending payment record ────────────────────────
    const [result] = await db.execute(
      `INSERT INTO payments
         (student_id, competition_name, fee_type, amount, currency,
          payment_status, razorpay_order_id, tournament_id)
       VALUES (?, ?, ?, ?, 'INR', 'Pending', ?, ?)`,
      [
        student_id,
        competition_name || null,
        finalFeeType,
        parsedAmount,
        razorpayOrder.id,
        tournament_id || null,
      ]
    );

    // ── Respond with order details ───────────────────────────
    // NEVER send RAZORPAY_KEY_SECRET to frontend
    res.status(201).json({
      payment_record_id:  result.insertId,
      razorpay_order_id:  razorpayOrder.id,
      amount:             razorpayOrder.amount,   // paise
      currency:           razorpayOrder.currency,
      key_id:             process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ message: 'Failed to create payment order.', error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/payments/verify
// Verifies Razorpay signature after successful checkout,
// generates PDF receipt, sends success email.
// ──────────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  const { payment_record_id, razorpay_order_id,
          razorpay_payment_id, razorpay_signature } = req.body;

  if (!payment_record_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: 'All four payment verification fields are required.' });
  }

  // ── Step 1: Fetch payment record ─────────────────────────────
  let record;
  try {
    const [rows] = await db.execute(
      'SELECT * FROM payments WHERE id = ?', [payment_record_id]
    );
    record = rows[0];
    if (!record) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }
  } catch (err) {
    console.error('Verify – DB fetch error:', err);
    return res.status(500).json({ message: 'Server error fetching payment.' });
  }

  // ── Step 2: Verify HMAC SHA256 signature ─────────────────────
  // Body is: razorpay_order_id + "|" + razorpay_payment_id
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  let isValid = false;

  if (isSandbox && razorpay_order_id.startsWith('order_mock_')) {
    // Graceful local test verification bypass
    isValid = true;
  } else {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'XXXXXXXXXXXXXXXXXXXXXXXX')
      .update(body)
      .digest('hex');
    isValid = expectedSignature === razorpay_signature;
  }

  if (!isValid) {
    // ── Invalid signature → mark Failed ──────────────────────
    try {
      await db.execute(
        `UPDATE payments
         SET payment_status  = 'Failed',
             failure_reason  = 'Razorpay signature verification failed.'
         WHERE id = ?`,
        [payment_record_id]
      );
    } catch (dbErr) {
      console.error('Verify – update failed status error:', dbErr);
    }

    // Send failure email (non-blocking)
    try {
      const student = await getStudent(record.student_id);
      if (student) {
        sendPaymentFailedEmail(student, {
          ...record,
          failure_reason: 'Payment signature verification failed.',
        }).catch(e => console.error('Failed email error (non-fatal):', e.message));
      }
    } catch (_) {}

    return res.status(400).json({ message: 'Payment verification failed. Invalid signature.' });
  }

  // ── Step 3: Signature valid → mark Paid ──────────────────────
  try {
    await db.execute(
      `UPDATE payments
       SET payment_status       = 'Paid',
           razorpay_payment_id  = ?,
           razorpay_signature   = ?,
           paid_at              = NOW()
       WHERE id = ?`,
      [razorpay_payment_id, razorpay_signature, payment_record_id]
    );
  } catch (err) {
    console.error('Verify – update Paid status error:', err);
    return res.status(500).json({ message: 'Payment verified but failed to update status.' });
  }

  // ── Step 4: Fetch updated record for receipt ──────────────────
  let updatedRecord;
  try {
    const [rows] = await db.execute(
      `SELECT p.*, s.full_name, s.email
       FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       WHERE p.id = ?`,
      [payment_record_id]
    );
    updatedRecord = rows[0];
  } catch (err) {
    console.error('Verify – fetch updated record error:', err);
    // Payment is already marked Paid — receipt failure is non-fatal
  }

  // ── Step 5: Generate PDF receipt (non-blocking on failure) ────
  let receiptUrl = null;
  if (updatedRecord) {
    try {
      receiptUrl = await generateReceipt({
        paymentId:        payment_record_id,
        studentName:      updatedRecord.full_name || 'Athlete',
        studentEmail:     updatedRecord.email || '',
        competitionName:  updatedRecord.competition_name || '—',
        feeType:          updatedRecord.fee_type || 'Competition Fee',
        amount:           updatedRecord.amount,
        currency:         updatedRecord.currency || 'INR',
        razorpayOrderId:  razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        paidAt:           new Date(),
      });

      await db.execute(
        'UPDATE payments SET receipt_url = ? WHERE id = ?',
        [receiptUrl, payment_record_id]
      );
    } catch (receiptErr) {
      console.error('Receipt generation error (non-fatal):', receiptErr.message);
    }
  }

  // ── Step 6: Send success email (non-blocking) ─────────────────
  if (updatedRecord) {
    const student = { id: updatedRecord.student_id, full_name: updatedRecord.full_name, email: updatedRecord.email };
    const receiptLink = receiptUrl
      ? `${process.env.BACKEND_URL || 'http://localhost:5002'}/api/payments/receipt/${payment_record_id}`
      : null;

    sendPaymentSuccessEmail(student, {
      ...updatedRecord,
      razorpay_payment_id,
      receipt_link: receiptLink,
    }).catch(e => console.error('Success email error (non-fatal):', e.message));
  }

  res.json({
    message:     'Payment verified successfully.',
    payment_status: 'Paid',
    receipt_url: receiptUrl,
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/payments/failed
// Called by frontend when user dismisses Razorpay or checkout fails.
// ──────────────────────────────────────────────────────────────
router.post('/failed', async (req, res) => {
  try {
    const { payment_record_id, failure_reason } = req.body;

    if (!payment_record_id) {
      return res.status(400).json({ message: 'payment_record_id is required.' });
    }

    const reason = failure_reason || 'Payment cancelled or failed.';

    const [rows] = await db.execute(
      'SELECT * FROM payments WHERE id = ?', [payment_record_id]
    );
    const record = rows[0];

    if (!record) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    // Only update if currently Pending (don't overwrite a Paid status)
    if (record.payment_status === 'Pending') {
      await db.execute(
        `UPDATE payments
         SET payment_status = 'Failed', failure_reason = ?
         WHERE id = ?`,
        [reason, payment_record_id]
      );

      // Send failure email (non-blocking)
      const student = await getStudent(record.student_id);
      if (student) {
        sendPaymentFailedEmail(student, { ...record, failure_reason: reason })
          .catch(e => console.error('Failed email error (non-fatal):', e.message));
      }
    }

    res.json({ message: 'Payment marked as failed.', payment_status: 'Failed' });
  } catch (err) {
    console.error('Payment failed route error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/payments/student/:studentId
// Returns payment history for a specific student.
// ──────────────────────────────────────────────────────────────
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const [rows] = await db.execute(
      `SELECT id, competition_name, fee_type, amount, currency,
              payment_status, razorpay_payment_id, receipt_url,
              failure_reason, paid_at, created_at
       FROM payments
       WHERE student_id = ?
       ORDER BY created_at DESC`,
      [studentId]
    );

    res.json({ payments: rows });
  } catch (err) {
    console.error('Get student payments error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/payments/admin/all
// Returns all payments with student details for coach/admin.
// ──────────────────────────────────────────────────────────────
router.get('/admin/all', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.*,
              s.full_name   AS student_name,
              s.email       AS student_email,
              s.mobile      AS student_mobile
       FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       ORDER BY p.created_at DESC`
    );

    // Summary stats
    const total   = rows.length;
    const paid    = rows.filter(r => r.payment_status === 'Paid').length;
    const pending = rows.filter(r => r.payment_status === 'Pending').length;
    const failed  = rows.filter(r => r.payment_status === 'Failed').length;
    const revenue = rows
      .filter(r => r.payment_status === 'Paid')
      .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    res.json({ payments: rows, summary: { total, paid, pending, failed, revenue } });
  } catch (err) {
    console.error('Admin get all payments error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/payments/admin/export
// Export all payment records as CSV.
// ──────────────────────────────────────────────────────────────
router.get('/admin/export', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.id, s.full_name AS student_name, s.email AS student_email,
              s.mobile AS student_mobile,
              p.competition_name, p.fee_type, p.amount, p.currency,
              p.payment_status, p.razorpay_order_id, p.razorpay_payment_id,
              p.failure_reason, p.paid_at, p.created_at
       FROM payments p
       LEFT JOIN students s ON s.id = p.student_id
       ORDER BY p.created_at DESC`
    );

    const headers = [
      'ID', 'Student Name', 'Email', 'Mobile', 'Competition', 'Fee Type',
      'Amount (INR)', 'Currency', 'Status', 'Razorpay Order ID',
      'Razorpay Payment ID', 'Failure Reason', 'Paid At', 'Created At',
    ];

    const escape = (v) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };

    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        escape(r.id),
        escape(r.student_name),
        escape(r.student_email),
        escape(r.student_mobile),
        escape(r.competition_name),
        escape(r.fee_type),
        escape(r.amount),
        escape(r.currency),
        escape(r.payment_status),
        escape(r.razorpay_order_id),
        escape(r.razorpay_payment_id),
        escape(r.failure_reason),
        escape(r.paid_at ? new Date(r.paid_at).toISOString() : ''),
        escape(r.created_at ? new Date(r.created_at).toISOString() : ''),
      ].join(',')),
    ];

    const csv = csvRows.join('\n');
    const filename = `payments_export_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('Export payments error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/payments/receipt/:paymentId
// Download receipt PDF — only if payment_status is 'Paid'.
// ──────────────────────────────────────────────────────────────
router.get('/receipt/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;

    const [rows] = await db.execute(
      'SELECT payment_status, receipt_url FROM payments WHERE id = ?',
      [paymentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    const { payment_status, receipt_url } = rows[0];

    if (payment_status !== 'Paid') {
      return res.status(403).json({ message: 'Receipt is only available for successful payments.' });
    }

    if (!receipt_url) {
      return res.status(404).json({ message: 'Receipt not yet generated for this payment.' });
    }

    const filePath = path.join(__dirname, '..', receipt_url);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Receipt file not found on server.' });
    }

    res.download(filePath, path.basename(filePath));
  } catch (err) {
    console.error('Download receipt error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
