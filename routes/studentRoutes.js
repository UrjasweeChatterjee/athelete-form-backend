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
const { callAI } = require('../utils/aiService');

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

// ── Helper: get BMI category ──────────────────────────────────
const getBmiCategory = (bmi) => {
  if (bmi === null || bmi === undefined) return null;
  const b = parseFloat(bmi);
  if (isNaN(b)) return null;
  if (b < 18.5) return 'Underweight';
  if (b >= 18.5 && b <= 24.9) return 'Normal';
  if (b >= 25 && b <= 29.9) return 'Overweight';
  return 'Obese';
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
        height_cm, weight_kg
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

      // Height and weight validation
      let heightCm = null;
      let weightKg = null;
      let bmi = null;
      if (height_cm !== undefined && height_cm !== null && height_cm !== '') {
        heightCm = parseFloat(height_cm);
        if (isNaN(heightCm) || heightCm <= 0) {
          return res.status(400).json({ message: 'Height must be a positive number.' });
        }
      }
      if (weight_kg !== undefined && weight_kg !== null && weight_kg !== '') {
        weightKg = parseFloat(weight_kg);
        if (isNaN(weightKg) || weightKg <= 0) {
          return res.status(400).json({ message: 'Weight must be a positive number.' });
        }
      }
      if (heightCm && weightKg) {
        bmi = Number((weightKg / ((heightCm / 100) * (heightCm / 100))).toFixed(2));
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
           photo, birth_certificate, id_proof, status,
           height_cm, weight_kg, bmi)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending',?,?,?)`,
        [
          full_name, dob, age, gender, mobile, email, hashedPassword,
          guardian_name, guardian_mobile, relation,
          address, city, state, pincode,
          club_name || null, state_association || null,
          sportsString, competition_name || null, age_group || null,
          photoPath, birthCertPath, idProofPath,
          heightCm, weightKg, bmi,
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
    studentData.bmi_category = getBmiCategory(studentData.bmi);

    res.json({
      message: 'Login successful.',
      student: studentData,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── GET /api/students/:id/ai-assistant ───────────────────────
// Real AI-powered athlete assistant. Builds a prompt from the
// student's actual DB profile and calls the configured AI API.
// The AI_API_KEY is kept server-side and never sent to the frontend.
router.get('/:id/ai-assistant', async (req, res) => {
  try {
    // ── 1. Fetch student from DB ────────────────────────────
    const [rows] = await db.execute(
      'SELECT * FROM students WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    // ── 2. Strip sensitive fields before touching AI ─────────
    const {
      password: _pw,
      birth_certificate: _bc,
      id_proof: _idp,
      ...safeStudent
    } = rows[0];

    // ── 3. Parse sports_applied (stored as JSON string) ──────
    let sportsArray = [];
    if (safeStudent.sports_applied) {
      try {
        const parsed = JSON.parse(safeStudent.sports_applied);
        sportsArray = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        sportsArray = [safeStudent.sports_applied];
      }
    }
    const sportsText = sportsArray.join(', ') || 'Not specified';

    // ── 4. Check AI key before calling ──────────────────────
    if (!process.env.AI_API_KEY || process.env.AI_API_KEY.trim() === '') {
      return res.status(503).json({
        success: false,
        message: 'AI API key is not configured. Please add AI_API_KEY in backend .env.',
      });
    }

    // ── 5. Build the AI prompt ───────────────────────────────
    const systemPrompt = `You are an expert sports coach and nutritionist AI assistant for a student athlete management platform.
Your job is to analyze a student athlete's profile and return practical, safe, beginner-friendly improvement suggestions.

CRITICAL RULES:
- Never provide medical diagnoses or medical prescriptions.
- Never recommend extreme dieting, fasting, or unsafe supplements.
- Never recommend unsafe or dangerous workout intensities for a student.
- Always include a safety note reminding the athlete to consult a coach, doctor, or guardian.
- Keep all advice appropriate for a student athlete based on their age and sport.
- Give sport-specific suggestions based on the sports_applied field.
- Do not invent data; only use what is provided in the athlete profile.

You MUST respond with ONLY valid JSON (no markdown, no extra text) in this exact structure:
{
  "greeting": "string",
  "athleteSummary": "string",
  "dietSuggestions": ["string"],
  "trainingSuggestions": ["string"],
  "staminaPlan": ["string"],
  "strengthFocus": ["string"],
  "flexibilityTips": ["string"],
  "weeklyRoutine": ["string - each entry is one day or block e.g. Monday: ..."],
  "motivationMessage": "string",
  "safetyNote": "string",
  "disclaimer": "This AI assistant gives general fitness guidance only. Final training plan should be confirmed by a qualified coach."
}`;

    const userPrompt = `Analyze this student athlete profile and generate personalized improvement suggestions.

Athlete Profile:
- Name: ${safeStudent.full_name}
- Age: ${safeStudent.age} years
- Gender: ${safeStudent.gender}
- Age Group: ${safeStudent.age_group || 'Not specified'}
- Sports Applied: ${sportsText}
- Competition Name: ${safeStudent.competition_name || 'Not specified'}
- Club Name: ${safeStudent.club_name || 'Not affiliated'}
- State Association: ${safeStudent.state_association || 'Not specified'}
- Registration Status: ${safeStudent.status}
- Profile Photo: ${safeStudent.photo ? 'Uploaded' : 'Missing'}
- Registered Since: ${safeStudent.created_at ? new Date(safeStudent.created_at).toDateString() : 'Unknown'}

Generate a complete, sport-specific, safe, and encouraging AI assistant response as JSON.`;

    // ── 6. Call AI API ───────────────────────────────────────
    const aiResult = await callAI(systemPrompt, userPrompt);

    if (!aiResult.ok) {
      return res.status(502).json({
        success: false,
        message: aiResult.error,
      });
    }

    // ── 7. Return structured response ────────────────────────
    return res.json({
      success: true,
      assistant: {
        greeting:           aiResult.data.greeting           || '',
        athleteSummary:     aiResult.data.athleteSummary     || '',
        dietSuggestions:    aiResult.data.dietSuggestions    || [],
        trainingSuggestions:aiResult.data.trainingSuggestions|| [],
        staminaPlan:        aiResult.data.staminaPlan        || [],
        strengthFocus:      aiResult.data.strengthFocus      || [],
        flexibilityTips:    aiResult.data.flexibilityTips    || [],
        weeklyRoutine:      aiResult.data.weeklyRoutine      || [],
        motivationMessage:  aiResult.data.motivationMessage  || '',
        safetyNote:         aiResult.data.safetyNote         || '',
        disclaimer:         aiResult.data.disclaimer         ||
          'This AI assistant gives general fitness guidance only. Final training plan should be confirmed by a qualified coach.',
      },
    });
  } catch (error) {
    console.error('Student AI assistant error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
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
    studentData.bmi_category = getBmiCategory(studentData.bmi);
    res.json(studentData);
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
