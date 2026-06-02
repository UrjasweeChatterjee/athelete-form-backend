// ─────────────────────────────────────────────────────────────
// routes/achievementRoutes.js  –  Achievement & Certificate APIs
//
// GET  /api/achievements/student/:studentId  – Student: view own results
// GET  /api/achievements/admin               – Coach/Admin: all results
// POST /api/achievements/admin/create        – Coach/Admin: create new result record
// PUT  /api/achievements/:id/result          – Coach/Admin: update result details
// PUT  /api/achievements/:id/publish         – Coach/Admin: publish result + send email
// POST /api/achievements/:id/generate-certificate – Generate PDF cert + email
// POST /api/achievements/:id/upload-certificate   – Upload manual PDF cert + email
// GET  /api/achievements/:id/download-certificate – Download certificate file
// ─────────────────────────────────────────────────────────────

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../db');
const { generateCertificate }           = require('../utils/certificateGenerator');
const { sendResultsPublishedEmail, sendCertificateAvailableEmail } = require('../utils/notificationService');

const router = express.Router();

// ── Certificate upload directory ──────────────────────────────
const CERT_DIR = path.join(__dirname, '..', 'uploads', 'certificates');
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

// ── Multer for manual certificate PDF upload ──────────────────
const certStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CERT_DIR),
  filename:    (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `manual_${ts}_${safe}`);
  },
});
const certUpload = multer({
  storage: certStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for certificates.'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── Helper: format date for display ──────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

// ── Helper: get student by id ─────────────────────────────────
const getStudent = async (studentId) => {
  const [rows] = await db.execute(
    'SELECT id, full_name, email, mobile FROM students WHERE id = ?',
    [studentId]
  );
  return rows[0] || null;
};

// ──────────────────────────────────────────────────────────────
// GET /api/achievements/student/:studentId
// Student: view their own competition results (published only for
// sensitive data — draft results show limited info).
// ──────────────────────────────────────────────────────────────
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const [rows] = await db.execute(
      `SELECT id, competition_name, competition_date, age_group,
              category_level, event_name,
              attendance_status, medal_won, result_text, result_status,
              certificate_url, certificate_generated_at, published_at,
              created_at
       FROM competition_results
       WHERE student_id = ?
       ORDER BY competition_date DESC, created_at DESC`,
      [studentId]
    );

    res.json({ results: rows });
  } catch (err) {
    console.error('Get student achievements error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/achievements/admin
// Coach/Admin: get ALL competition results with student info.
// ──────────────────────────────────────────────────────────────
router.get('/admin', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT cr.*,
              s.full_name  AS student_name,
              s.email      AS student_email,
              s.mobile     AS student_mobile
       FROM competition_results cr
       LEFT JOIN students s ON s.id = cr.student_id
       ORDER BY cr.created_at DESC`
    );

    res.json({ results: rows });
  } catch (err) {
    console.error('Get admin achievements error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/achievements/admin/create
// Coach/Admin: create a new competition_results record for a student.
// ──────────────────────────────────────────────────────────────
router.post('/admin/create', async (req, res) => {
  try {
    const {
      student_id, competition_name, competition_date,
      age_group, category_level, event_name,
    } = req.body;

    if (!student_id || !competition_name) {
      return res.status(400).json({ message: 'student_id and competition_name are required.' });
    }

    // Verify student exists
    const student = await getStudent(student_id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const [result] = await db.execute(
      `INSERT INTO competition_results
         (student_id, competition_name, competition_date, age_group, category_level, event_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        student_id,
        competition_name,
        competition_date || null,
        age_group        || null,
        category_level   || null,
        event_name       || null,
      ]
    );

    res.status(201).json({
      message:  'Competition result record created.',
      resultId: result.insertId,
    });
  } catch (err) {
    console.error('Create achievement error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/achievements/:id/result
// Coach/Admin: update attendance, medal, result_text, result_status.
// Only allowed when result_status is 'Draft'.
// ──────────────────────────────────────────────────────────────
router.put('/:id/result', async (req, res) => {
  try {
    const { id } = req.params;
    const { attendance_status, medal_won, result_text, result_status } = req.body;

    // Validate enums
    const validAttendance = ['Present', 'Absent', 'Pending'];
    const validMedals     = ['Gold', 'Silver', 'Bronze', 'None'];
    const validStatus     = ['Draft', 'Published'];

    if (attendance_status && !validAttendance.includes(attendance_status)) {
      return res.status(400).json({ message: 'Invalid attendance_status value.' });
    }
    if (medal_won && !validMedals.includes(medal_won)) {
      return res.status(400).json({ message: 'Invalid medal_won value.' });
    }
    if (result_status && !validStatus.includes(result_status)) {
      return res.status(400).json({ message: 'Invalid result_status value.' });
    }

    await db.execute(
      `UPDATE competition_results
       SET attendance_status = COALESCE(?, attendance_status),
           medal_won         = COALESCE(?, medal_won),
           result_text       = COALESCE(?, result_text),
           result_status     = COALESCE(?, result_status)
       WHERE id = ?`,
      [
        attendance_status || null,
        medal_won         || null,
        result_text       || null,
        result_status     || null,
        id,
      ]
    );

    res.json({ message: 'Result updated successfully.' });
  } catch (err) {
    console.error('Update result error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/achievements/:id/publish
// Coach/Admin: publish result + send email to student.
// ──────────────────────────────────────────────────────────────
router.put('/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the result record
    const [rows] = await db.execute(
      'SELECT * FROM competition_results WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Result record not found.' });
    }
    const record = rows[0];

    if (record.result_status === 'Published') {
      return res.status(409).json({ message: 'Result is already published.' });
    }

    // Publish
    await db.execute(
      'UPDATE competition_results SET result_status = ?, published_at = NOW() WHERE id = ?',
      ['Published', id]
    );

    // Send email (non-blocking — result publish should not fail if email fails)
    const student = await getStudent(record.student_id);
    if (student) {
      const certLink = record.certificate_url
        ? `${process.env.BACKEND_URL || 'http://localhost:5002'}/api/achievements/${id}/download-certificate`
        : null;
      sendResultsPublishedEmail(student, {
        competition_name: record.competition_name,
        competition_date: fmtDate(record.competition_date),
        result_text:      record.result_text,
        medal_won:        record.medal_won,
      }, certLink).catch(err => console.error('Email send error (non-fatal):', err.message));
    }

    res.json({ message: 'Result published successfully. Student notification sent.' });
  } catch (err) {
    console.error('Publish result error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/achievements/:id/generate-certificate
// Coach/Admin: generate PDF certificate + save path + email student.
// ──────────────────────────────────────────────────────────────
router.post('/:id/generate-certificate', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch record
    const [rows] = await db.execute(
      `SELECT cr.*, s.full_name, s.email
       FROM competition_results cr
       LEFT JOIN students s ON s.id = cr.student_id
       WHERE cr.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Result record not found.' });
    }
    const record = rows[0];

    // Respond immediately – PDF generation can be slow on first run
    res.json({ message: '⏳ Certificate generation started! Email will be sent to the student once ready.' });

    // ── Generate PDF, save to DB, and email – all in background ─
    generateCertificate({
      resultId:        record.id,
      studentName:     record.full_name || 'Athlete',
      competitionName: record.competition_name,
      competitionDate: fmtDate(record.competition_date),
      categoryLevel:   record.category_level || '',
      ageGroup:        record.age_group || '',
      medalWon:        record.medal_won || 'None',
      resultText:      record.result_text || 'Participant',
      eventName:       record.event_name || '',
    }).then(async (relPath) => {
      // Save path to DB
      await db.execute(
        'UPDATE competition_results SET certificate_url = ?, certificate_generated_at = NOW() WHERE id = ?',
        [relPath, id]
      );
      console.log(`📜  Certificate saved: ${relPath}`);

      // Send email (non-blocking)
      if (record.email) {
        const student  = { id: record.student_id, full_name: record.full_name, email: record.email };
        const certLink = `${process.env.BACKEND_URL || 'http://localhost:5002'}/api/achievements/${id}/download-certificate`;
        sendCertificateAvailableEmail(student, certLink)
          .catch(err => console.error('Certificate email error (non-fatal):', err.message));
      }
    }).catch(err => {
      console.error('Background certificate generation error:', err.message);
    });

  } catch (err) {
    console.error('Generate certificate error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/achievements/:id/upload-certificate
// Coach/Admin: upload a manual PDF certificate.
// ──────────────────────────────────────────────────────────────
router.post('/:id/upload-certificate', certUpload.single('certificate'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'No PDF file uploaded.' });
    }

    const relPath = `uploads/certificates/${req.file.filename}`;

    // Save path to DB
    await db.execute(
      'UPDATE competition_results SET certificate_url = ?, certificate_generated_at = NOW() WHERE id = ?',
      [relPath, id]
    );

    // Fetch student to send email
    const [rows] = await db.execute(
      `SELECT cr.student_id, s.full_name, s.email
       FROM competition_results cr
       LEFT JOIN students s ON s.id = cr.student_id
       WHERE cr.id = ?`,
      [id]
    );

    if (rows.length > 0 && rows[0].email) {
      const { student_id, full_name, email } = rows[0];
      const student  = { id: student_id, full_name, email };
      const certLink = `${process.env.BACKEND_URL || 'http://localhost:5002'}/api/achievements/${id}/download-certificate`;
      sendCertificateAvailableEmail(student, certLink)
        .catch(err => console.error('Upload certificate email error (non-fatal):', err.message));
    }

    res.json({ message: 'Certificate uploaded successfully.', certificate_url: relPath });
  } catch (err) {
    // Multer file type/size error
    if (err.message.includes('Only PDF') || err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Upload certificate error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/achievements/:id/download-certificate
// Download certificate PDF for a specific result record.
// ──────────────────────────────────────────────────────────────
router.get('/:id/download-certificate', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.execute(
      'SELECT certificate_url FROM competition_results WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Result record not found.' });
    }

    const { certificate_url } = rows[0];
    if (!certificate_url) {
      return res.status(404).json({ message: 'Certificate not yet generated or uploaded.' });
    }

    const filePath = path.join(__dirname, '..', certificate_url);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Certificate file not found on server.' });
    }

    res.download(filePath, path.basename(filePath));
  } catch (err) {
    console.error('Download certificate error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/achievements/:id/send-certificate-email
// Coach/Admin: manually re-send the certificate email to student.
// ──────────────────────────────────────────────────────────────
router.post('/:id/send-certificate-email', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.execute(
      `SELECT cr.certificate_url, cr.student_id, s.full_name, s.email
       FROM competition_results cr
       LEFT JOIN students s ON s.id = cr.student_id
       WHERE cr.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Result record not found.' });
    }

    const { certificate_url, student_id, full_name, email } = rows[0];
    if (!certificate_url) {
      return res.status(400).json({ message: 'No certificate available to email.' });
    }
    if (!email) {
      return res.status(400).json({ message: 'Student email not found.' });
    }

    const student  = { id: student_id, full_name, email };
    const certLink = `${process.env.BACKEND_URL || 'http://localhost:5002'}/api/achievements/${id}/download-certificate`;

    // Respond immediately so the frontend isn't blocked by SMTP latency
    res.json({ message: '📧 Certificate email is being sent to ' + email });

    // Send email non-blocking (logged to notification_logs regardless of outcome)
    sendCertificateAvailableEmail(student, certLink)
      .catch(err => console.error('Certificate email error (non-fatal):', err.message));

  } catch (err) {
    console.error('Send cert email error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
});

module.exports = router;
