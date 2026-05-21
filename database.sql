-- ============================================================
-- Sports Club Management Platform - Database Schema
-- Phase 1
-- ============================================================

-- Create and select the database
CREATE DATABASE IF NOT EXISTS sports_club_db;
USE sports_club_db;

-- ────────────────────────────────────────────────────────────
-- Table: coaches
-- Stores coach/admin login credentials
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coaches (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,       -- bcrypt hashed
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- Table: students
-- Stores athlete registration data
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id                  INT AUTO_INCREMENT PRIMARY KEY,

  -- Step 1: Personal Details
  full_name           VARCHAR(150)  NOT NULL,
  dob                 DATE          NOT NULL,
  age                 INT           NOT NULL,
  gender              VARCHAR(20)   NOT NULL,
  mobile              VARCHAR(15)   NOT NULL,
  email               VARCHAR(150)  NOT NULL UNIQUE,
  password            VARCHAR(255)  NOT NULL,   -- bcrypt hashed

  -- Step 2: Guardian Details
  guardian_name       VARCHAR(150)  NOT NULL,
  guardian_mobile     VARCHAR(15)   NOT NULL,
  relation            VARCHAR(50)   NOT NULL,

  -- Step 3: Address Details
  address             TEXT          NOT NULL,
  city                VARCHAR(100)  NOT NULL,
  state               VARCHAR(100)  NOT NULL,
  pincode             VARCHAR(10)   NOT NULL,

  -- Step 4: Club / State Details
  club_name           VARCHAR(150),
  state_association   VARCHAR(150),

  -- Step 5: Sports / Competition Details
  sports_applied      TEXT          NOT NULL,   -- stored as JSON array string
  competition_name    VARCHAR(200),
  age_group           VARCHAR(50),

  -- Step 6: Document paths (relative to uploads/)
  photo               VARCHAR(300),
  birth_certificate   VARCHAR(300),
  id_proof            VARCHAR(300),

  -- Application Status
  status              ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',

  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- Seed: Default Coach Account
-- Password: coach123  (bcrypt hash generated at runtime by seed)
-- We insert a pre-hashed value so the SQL works standalone.
-- Hash of "coach123" with bcrypt cost 10:
-- ────────────────────────────────────────────────────────────
INSERT INTO coaches (name, email, password) VALUES
(
  'Default Coach',
  'coach@gmail.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
  -- ↑ This is bcrypt hash of "password". 
  -- The server will auto-seed the correct hash if you run: npm run seed
  -- OR simply reset via the /api/coaches/seed route in dev mode.
)
ON DUPLICATE KEY UPDATE id = id;

-- ────────────────────────────────────────────────────────────
-- NOTE: After importing this file, run the backend once and
-- call GET http://localhost:5000/api/coaches/seed  (dev only)
-- to re-hash coach123 correctly.  Or update manually:
--   UPDATE coaches SET password='<bcrypt hash>' WHERE email='coach@gmail.com';
-- ────────────────────────────────────────────────────────────
