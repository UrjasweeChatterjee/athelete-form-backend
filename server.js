// ─────────────────────────────────────────────────────────────
// server.js  –  Main Express server entry point
// ─────────────────────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const studentRoutes = require('./routes/studentRoutes');
const coachRoutes = require('./routes/coachRoutes');

const app = express();
const PORT = process.env.PORT || 5002;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: 'http://localhost:5173',  // Vite dev server
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve uploaded files as static assets ────────────────────
// e.g. http://localhost:5002/uploads/photos/photo.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/students', studentRoutes);
app.use('/api/coaches', coachRoutes);

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
  console.log(`🔑  Coach seed route:  http://localhost:${PORT}/api/coaches/seed\n`);
});
