// ─────────────────────────────────────────────────────────────
// routes/studentRoutes.js  –  Student API endpoints
//
// POST /api/students/register  – Register athlete with documents
// POST /api/students/login     – Student login (email + password)
// GET  /api/students/:id       – Get student details by ID
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const { upload, processFile } = require('../middleware/upload');

const router = express.Router();

// ── Helper: calculate age from date of birth ─────────────────
const calculateAge = (dob) => {
  const today    = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

// ── POST /api/students/register ──────────────────────────────
// Accepts multipart/form-data with fields + 3 optional files.
router.post(
  '/register',
  upload.fields([
    { name: 'photo',             maxCount: 1 },
    { name: 'birth_certificate', maxCount: 1 },
    { name: 'id_proof',          maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        full_name, dob, gender, mobile, email, password,
        guardian_name, guardian_mobile, relation,
        address, city, state, pincode,
        club_name, state_association,
        sports_applied, competition_name, age_group,
      } = req.body;

      // ── Backend validation ────────────────────────────────
      if (!full_name || !dob || !gender || !mobile || !email || !password) {
        return res.status(400).json({ message: 'Personal details are required.' });
      }
      if (!/^\d{10}$/.test(mobile)) {
        return res.status(400).json({ message: 'Mobile number must be exactly 10 digits.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Invalid email address.' });
      }
      if (!guardian_name || !guardian_mobile || !relation) {
        return res.status(400).json({ message: 'Guardian details are required.' });
      }
      if (!/^\d{10}$/.test(guardian_mobile)) {
        return res.status(400).json({ message: 'Guardian mobile must be exactly 10 digits.' });
      }
      if (!address || !city || !state || !pincode) {
        return res.status(400).json({ message: 'Address details are required.' });
      }
      if (!/^\d{6}$/.test(pincode)) {
        return res.status(400).json({ message: 'Pincode must be exactly 6 digits.' });
      }
      if (!sports_applied) {
        return res.status(400).json({ message: 'Please select at least one sport.' });
      }

      // ── Check duplicate email ─────────────────────────────
      const [existing] = await db.execute(
        'SELECT id FROM students WHERE email = ?', [email]
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Email already registered. Please login.' });
      }

      // ── Calculate age ─────────────────────────────────────
      const age = calculateAge(dob);

      // ── Hash password ─────────────────────────────────────
      const hashedPassword = await bcrypt.hash(password, 10);

      // ── Process uploaded files ────────────────────────────
      let photoPath = null;
      let birthCertPath = null;
      let idProofPath = null;

      if (req.files?.photo?.[0]) {
        photoPath = await processFile(req.files.photo[0], 'photo');
      }
      if (req.files?.birth_certificate?.[0]) {
        birthCertPath = await processFile(req.files.birth_certificate[0], 'birth_certificate');
      }
      if (req.files?.id_proof?.[0]) {
        idProofPath = await processFile(req.files.id_proof[0], 'id_proof');
      }

      // ── Normalize sports_applied to JSON string ───────────
      let sportsString = sports_applied;
      if (Array.isArray(sports_applied)) {
        sportsString = JSON.stringify(sports_applied);
      } else if (typeof sports_applied === 'string') {
        try { JSON.parse(sports_applied); } // already JSON
        catch { sportsString = JSON.stringify([sports_applied]); }
      }

      // ── Insert into database ──────────────────────────────
      const [result] = await db.execute(
        `INSERT INTO students
          (full_name, dob, age, gender, mobile, email, password,
           guardian_name, guardian_mobile, relation,
           address, city, state, pincode,
           club_name, state_association,
           sports_applied, competition_name, age_group,
           photo, birth_certificate, id_proof, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending')`,
        [
          full_name, dob, age, gender, mobile, email, hashedPassword,
          guardian_name, guardian_mobile, relation,
          address, city, state, pincode,
          club_name || null, state_association || null,
          sportsString, competition_name || null, age_group || null,
          photoPath, birthCertPath, idProofPath,
        ]
      );

      res.status(201).json({
        message: 'Registration successful! Your application is pending review.',
        studentId: result.insertId,
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error. Please try again.' });
    }
  }
);

// ── POST /api/students/login ─────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Fetch student by email
    const [rows] = await db.execute(
      'SELECT * FROM students WHERE email = ?', [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const student = rows[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Don't send password back to frontend
    const { password: _pw, ...studentData } = student;

    res.json({
      message: 'Login successful.',
      student: studentData,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── GET /api/students/:id ────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM students WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    const { password: _pw, ...studentData } = rows[0];
    res.json(studentData);
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
