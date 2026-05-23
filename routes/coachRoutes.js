// ─────────────────────────────────────────────────────────────
// routes/coachRoutes.js  –  Coach API endpoints
//
// POST /api/coaches/login              – Coach login
// GET  /api/coaches/seed               – Seed default coach (dev)
// GET  /api/coaches/students           – Get all students
// GET  /api/coaches/students/:id       – Get one student profile
// PUT  /api/coaches/students/:id/status – Approve / Reject
// GET  /api/coaches/export/csv         – Export CSV
// GET  /api/coaches/export/sql         – Export SQL file
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const { sendStatusEmail } = require('../utils/mailer');
const { Parser } = require('json2csv');
const { callAI } = require('../utils/aiService');

const router = express.Router();

// Helper: calculate BMI category
const getBmiCategory = (bmi) => {
  if (bmi === null || bmi === undefined) return null;
  const b = parseFloat(bmi);
  if (isNaN(b)) return null;
  if (b < 18.5) return 'Underweight';
  if (b >= 18.5 && b <= 24.9) return 'Normal';
  if (b >= 25 && b <= 29.9) return 'Overweight';
  return 'Obese';
};

// ── POST /api/coaches/login ──────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const [rows] = await db.execute(
      'SELECT * FROM coaches WHERE email = ?', [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const coach = rows[0];
    const isMatch = await bcrypt.compare(password, coach.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const { password: _pw, ...coachData } = coach;
    res.json({ message: 'Login successful.', coach: coachData });
  } catch (error) {
    console.error('Coach login error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/coaches/seed (DEV ONLY) ─────────────────────────
// Re-seeds the default coach with correctly hashed password.
router.get('/seed', async (req, res) => {
  try {
    const hashed = await bcrypt.hash('coach123', 10);
    await db.execute(
      `INSERT INTO coaches (name, email, password) VALUES ('Default Coach','coach@gmail.com',?)
       ON DUPLICATE KEY UPDATE password = ?`,
      [hashed, hashed]
    );
    res.json({ message: 'Default coach seeded. Email: coach@gmail.com | Password: coach123' });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ message: 'Seed failed.' });
  }
});

// ── GET /api/coaches/students ────────────────────────────────
// Returns all students (without passwords) with summary stats.
router.get('/students', async (req, res) => {
  try {
    const [students] = await db.execute(
      `SELECT id, full_name, mobile, age, age_group, sports_applied,
              competition_name, email, status, created_at,
              height_cm, weight_kg, bmi
       FROM students
       ORDER BY created_at DESC`
    );

    // Attach bmi_category
    const studentsWithBmi = students.map(s => ({
      ...s,
      bmi_category: getBmiCategory(s.bmi)
    }));

    // Build dashboard count stats
    const total    = studentsWithBmi.length;
    const pending  = studentsWithBmi.filter(s => s.status === 'Pending').length;
    const approved = studentsWithBmi.filter(s => s.status === 'Approved').length;
    const rejected = studentsWithBmi.filter(s => s.status === 'Rejected').length;

    res.json({ students: studentsWithBmi, stats: { total, pending, approved, rejected } });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/coaches/ai-athlete-insights ──────────────────────
// Real AI-powered insights for coach/admin.
// Sends all athlete summaries (no passwords) to the AI API
// and returns structured per-athlete insights + summary stats.
// AI NEVER auto-approves or auto-rejects. Final decision is manual.
router.get('/ai-athlete-insights', async (req, res) => {
  try {
    // ── 1. Fetch all students (no passwords) ────────────────
    const [students] = await db.execute(
      `SELECT id, full_name, dob, age, gender, age_group,
              sports_applied, competition_name, club_name,
              state_association, status, photo,
              birth_certificate, id_proof, created_at
       FROM students ORDER BY created_at DESC`
    );

    // ── 2. Guard: key must be configured ───────────────────
    if (!process.env.AI_API_KEY || process.env.AI_API_KEY.trim() === '') {
      return res.status(503).json({
        success: false,
        message: 'AI API key is not configured. Please add AI_API_KEY in backend .env.',
      });
    }

    if (students.length === 0) {
      return res.json({
        success: true,
        summary: { totalAthletes: 0, strongProfiles: 0, needsReview: 0, incompleteProfiles: 0 },
        insights: [],
        disclaimer: 'AI recommendation is only for coach assistance. Final decision must be taken by the coach/admin.',
      });
    }

    // ── 3. Build summarized athlete list for the prompt ───────
    const athleteSummaries = students.map((s, idx) => {
      let sportsArray = [];
      if (s.sports_applied) {
        try {
          const p = JSON.parse(s.sports_applied);
          sportsArray = Array.isArray(p) ? p : [p];
        } catch {
          sportsArray = [s.sports_applied];
        }
      }

      const hasPhoto = !!s.photo;
      const hasBirthCert = !!s.birth_certificate;
      const hasIdProof = !!s.id_proof;

      return `Athlete ${idx + 1}:
  - ID: ${s.id}
  - Name: ${s.full_name}
  - Age: ${s.age}, Gender: ${s.gender}, Age Group: ${s.age_group || 'N/A'}
  - Sports: ${sportsArray.join(', ') || 'Not specified'}
  - Competition: ${s.competition_name || 'None'}
  - Club: ${s.club_name || 'None'}, State Association: ${s.state_association || 'None'}
  - Status: ${s.status}
  - Documents: Photo=${hasPhoto ? 'Yes' : 'Missing'}, BirthCert=${hasBirthCert ? 'Yes' : 'Missing'}, IDProof=${hasIdProof ? 'Yes' : 'Missing'}
  - Registered: ${s.created_at ? new Date(s.created_at).toDateString() : 'Unknown'}`;
    }).join('\n\n');

    // ── 4. Build AI prompt ─────────────────────────────────
    const systemPrompt = `You are an expert sports coach assistant AI for a club management platform.
Your job is to analyze a list of student athlete profiles and return structured insights to help the coach make informed decisions.

CRITICAL RULES:
- You MUST NOT automatically approve or reject any athlete.
- All final decisions MUST remain with the human coach/admin.
- Use careful language: "estimated", "suggested", "appears to be", "profile suggests".
- Do not claim real stamina data unless a stamina test is mentioned; use "Estimated stamina based on sport and profile completeness".
- If documents are missing, flag them clearly.
- Do not invent data beyond what is given.
- Be constructive, professional, and supportive.

You MUST respond with ONLY valid JSON (no markdown, no extra text) in this exact structure:
{
  "summary": {
    "totalAthletes": 0,
    "strongProfiles": 0,
    "needsReview": 0,
    "incompleteProfiles": 0
  },
  "insights": [
    {
      "athleteId": 0,
      "athleteName": "",
      "sport": "",
      "ageGroup": "",
      "currentStatus": "",
      "profileCompleteness": "",
      "qualityScore": 0,
      "estimatedStaminaLevel": "",
      "strengths": [],
      "improvementAreas": [],
      "documentIssues": [],
      "coachSuggestion": "",
      "approvalSupportNote": ""
    }
  ]
}

For each athlete:
- profileCompleteness: a percentage string like "75%"
- qualityScore: integer 0-100
- estimatedStaminaLevel: "High (Estimated)", "Medium (Estimated)", or "Needs Improvement (Estimated)"
- strengths: list of positive profile attributes
- improvementAreas: list of areas needing attention
- documentIssues: list any missing or potentially missing documents
- coachSuggestion: one actionable suggestion for the coach
- approvalSupportNote: a balanced note to assist the coach's manual decision (never a final approval or rejection)`;

    const userPrompt = `Analyze the following ${students.length} athlete profile(s) and return structured insights.

${athleteSummaries}

Return your complete analysis as JSON following the exact structure specified.`;

    // ── 5. Call AI API ───────────────────────────────────────
    const aiResult = await callAI(systemPrompt, userPrompt);

    if (!aiResult.ok) {
      return res.status(502).json({
        success: false,
        message: aiResult.error,
      });
    }

    // ── 6. Return structured response ────────────────────────
    return res.json({
      success: true,
      summary: aiResult.data.summary || {
        totalAthletes: students.length,
        strongProfiles: 0,
        needsReview: 0,
        incompleteProfiles: 0,
      },
      insights: aiResult.data.insights || [],
      disclaimer: 'AI recommendation is only for coach assistance. Final decision must be taken by the coach/admin.',
    });
  } catch (error) {
    console.error('Coach AI insights error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/coaches/students/:id ───────────────────────────

// Returns full student profile (no password).
router.get('/students/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM students WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    const { password: _pw, ...studentData } = rows[0];
    studentData.bmi_category = getBmiCategory(studentData.bmi);
    res.json(studentData);
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/coaches/students/:id/status ────────────────────
// Approve or reject a student and send email.
router.put('/students/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id }     = req.params;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Approved or Rejected.' });
    }

    // Fetch student info (including current status) for guard check + email
    const [rows] = await db.execute(
      'SELECT full_name, email, status FROM students WHERE id = ?', [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const student = rows[0];

    // ── Final-action guard ──────────────────────────────────────
    // Once a decision has been made (Approved or Rejected) it cannot be reversed.
    if (student.status === 'Approved' || student.status === 'Rejected') {
      return res.status(409).json({
        message: `This application has already been ${student.status.toLowerCase()}. No further changes are allowed.`,
      });
    }

    // Update status in DB
    await db.execute(
      'UPDATE students SET status = ? WHERE id = ?', [status, id]
    );

    // Send email notification (non-blocking – don't fail the request if email fails)
    sendStatusEmail(student.email, student.full_name, status)
      .then(sent => {
        if (!sent) console.warn('⚠️  Email notification failed for student:', id);
      });

    res.json({ message: `Student application ${status.toLowerCase()} successfully.` });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/coaches/export/csv ──────────────────────────────
// Exports all student data as a downloadable CSV file.
router.get('/export/csv', async (req, res) => {
  try {
    const [students] = await db.execute(
      `SELECT id, full_name, dob, age, gender, mobile, email,
              guardian_name, guardian_mobile, relation,
              address, city, state, pincode,
              club_name, state_association,
              sports_applied, competition_name, age_group,
              status, created_at, height_cm, weight_kg, bmi
       FROM students
       ORDER BY id`
    );

    const fields = [
      'id','full_name','dob','age','gender','mobile','email',
      'guardian_name','guardian_mobile','relation',
      'address','city','state','pincode',
      'club_name','state_association',
      'sports_applied','competition_name','age_group',
      'status','created_at', 'height_cm', 'weight_kg', 'bmi'
    ];

    const parser = new Parser({ fields });
    const csv    = parser.parse(students);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students_export.csv"');
    res.send(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ message: 'Export failed.' });
  }
});

// ── GET /api/coaches/export/sql ──────────────────────────────
// Generates an SQL INSERT dump of all student records.
router.get('/export/sql', async (req, res) => {
  try {
    const [students] = await db.execute(
      'SELECT * FROM students ORDER BY id'
    );

    let sql = `-- Sports Club Management – Student Data Export\n`;
    sql    += `-- Generated: ${new Date().toISOString()}\n\n`;
    sql    += `USE sports_club_db;\n\n`;

    // Build INSERT statements (passwords are already hashed)
    students.forEach(s => {
      const escape = (val) => {
        if (val === null || val === undefined) return 'NULL';
        return `'${String(val).replace(/'/g, "''")}'`;
      };

      const hVal = s.height_cm === null || s.height_cm === undefined ? 'NULL' : s.height_cm;
      const wVal = s.weight_kg === null || s.weight_kg === undefined ? 'NULL' : s.weight_kg;
      const bVal = s.bmi === null || s.bmi === undefined ? 'NULL' : s.bmi;

      sql += `INSERT INTO students ` +
        `(id, full_name, dob, age, gender, mobile, email, password, ` +
        `guardian_name, guardian_mobile, relation, ` +
        `address, city, state, pincode, club_name, state_association, ` +
        `sports_applied, competition_name, age_group, ` +
        `photo, birth_certificate, id_proof, status, created_at, height_cm, weight_kg, bmi) VALUES ` +
        `(${s.id}, ${escape(s.full_name)}, ${escape(s.dob)}, ${s.age}, ` +
        `${escape(s.gender)}, ${escape(s.mobile)}, ${escape(s.email)}, ${escape(s.password)}, ` +
        `${escape(s.guardian_name)}, ${escape(s.guardian_mobile)}, ${escape(s.relation)}, ` +
        `${escape(s.address)}, ${escape(s.city)}, ${escape(s.state)}, ${escape(s.pincode)}, ` +
        `${escape(s.club_name)}, ${escape(s.state_association)}, ` +
        `${escape(s.sports_applied)}, ${escape(s.competition_name)}, ${escape(s.age_group)}, ` +
        `${escape(s.photo)}, ${escape(s.birth_certificate)}, ${escape(s.id_proof)}, ` +
        `${escape(s.status)}, ${escape(s.created_at)}, ${hVal}, ${wVal}, ${bVal});\n`;
    });

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="students_backup.sql"');
    res.send(sql);
  } catch (error) {
    console.error('SQL export error:', error);
    res.status(500).json({ message: 'SQL export failed.' });
  }
});

module.exports = router;
