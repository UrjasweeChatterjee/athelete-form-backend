-- ============================================================
-- Sports Club Management Platform
-- Tournaments & Events Module Migration
-- ============================================================
-- Run ONCE against sports_club_db.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

USE sports_club_db;

-- 1. Create tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(255)    NOT NULL,
    sport         VARCHAR(100)    NOT NULL,
    event_date    DATE            NOT NULL,
    fee_amount    DECIMAL(10,2)   NOT NULL,
    description   TEXT            NULL,
    created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Add tournament_id column and foreign key to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tournament_id INT NULL;

-- 3. Add foreign key constraint if not already exists
-- We can add the column and try to alter safely
ALTER TABLE payments ADD CONSTRAINT fk_payment_tournament 
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) 
    ON DELETE SET NULL;
