// ─────────────────────────────────────────────────────────────
// server.js  –  Main Express server entry point
// ─────────────────────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const studentRoutes      = require('./routes/studentRoutes');
const coachRoutes        = require('./routes/coachRoutes');
const achievementRoutes  = require('./routes/achievementRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const paymentRoutes      = require('./routes/paymentRoutes');
const tournamentRoutes   = require('./routes/tournamentRoutes');
const { startReminderJobs } = require('./jobs/reminderJobs');

const app = express();
const PORT = process.env.PORT || 5002;

// ── Middleware ────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server or postman requests with no origin
    if (!origin) return callback(null, true);
    
    // Check if origin is in the allowed list or is a Vercel/Netlify deployment
    const isAllowed = allowedOrigins.includes(origin) || 
                      origin.endsWith('.vercel.app') || 
                      origin.endsWith('.netlify.app') ||
                      origin.startsWith('http://localhost:');
                      
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve uploaded files as static assets ────────────────────
// e.g. http://localhost:5002/uploads/photos/photo.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/students',       studentRoutes);
app.use('/api/coaches',        coachRoutes);
app.use('/api/achievements',   achievementRoutes);
app.use('/api/notifications',  notificationRoutes);
app.use('/api/payments',       paymentRoutes);
app.use('/api/tournaments',    tournamentRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Sports Club Management API is running 🚀', version: '1.0.0' });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ message: err.message || 'Internal server error.' });
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Sports Club API running at http://localhost:${PORT}`);
  console.log(`📁  Uploads served at  http://localhost:${PORT}/uploads`);
  console.log(`🔑  Coach seed route:  http://localhost:${PORT}/api/coaches/seed`);
  console.log(`🏆  Achievements API:  http://localhost:${PORT}/api/achievements`);
  console.log(`🔔  Notifications API: http://localhost:${PORT}/api/notifications`);
  console.log(`💳  Payments API:      http://localhost:${PORT}/api/payments\n`);

  // Start scheduled reminder jobs (daily emails)
  startReminderJobs();
});

