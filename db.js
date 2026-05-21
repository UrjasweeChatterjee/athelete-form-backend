// ─────────────────────────────────────────────────────────────
// db.js  –  MySQL Connection Pool
// Uses mysql2 with promise support for async/await queries.
// All credentials come from the .env file.
// ─────────────────────────────────────────────────────────────
const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool (more efficient than single connections)
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'sports_club_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

// Quick connectivity test on startup
pool.getConnection()
  .then(conn => {
    console.log('✅  MySQL connected successfully.');
    conn.release();
  })
  .catch(err => {
    console.error('❌  MySQL connection failed:', err.message);
  });

module.exports = pool;
