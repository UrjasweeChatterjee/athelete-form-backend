-- ============================================================
-- Sports Club Management Platform - Phase 2 Migration
-- Module 6: Achievement & Certificate Management System
-- Module 7: Notification & Reminder System
-- ============================================================
-- Run this file ONCE against your sports_club_db database.
-- It uses IF NOT EXISTS so it is safe to re-run.
-- ============================================================

USE sports_club_db;

-- ────────────────────────────────────────────────────────────
-- Table: competition_results
-- Stores per-student competition results, medals, certificates.
-- student_id references the students table.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competition_results (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    student_id              INT           NOT NULL,
    competition_name        VARCHAR(255)  NOT NULL,
    competition_date        DATE          NULL,
    age_group               VARCHAR(100)  NULL,
    category_level          VARCHAR(100)  NULL,   -- e.g. District / State / National
    event_name              VARCHAR(255)  NULL,   -- specific event within competition

    -- Result details (set by Coach/Admin)
    attendance_status       ENUM('Present','Absent','Pending')           DEFAULT 'Pending',
    medal_won               ENUM('Gold','Silver','Bronze','None')         DEFAULT 'None',
    result_text             VARCHAR(255)                                  DEFAULT 'Participant',
    result_status           ENUM('Draft','Published')                    DEFAULT 'Draft',

    -- Certificate
    certificate_url         VARCHAR(500)  NULL,         -- relative path e.g. uploads/certificates/cert_1.pdf
    certificate_generated_at TIMESTAMP   NULL,

    -- Timestamps
    published_at            TIMESTAMP    NULL,
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key (soft ref — do not cascade delete to protect data)
    INDEX idx_student_id (student_id),
    INDEX idx_result_status (result_status)
);

-- ────────────────────────────────────────────────────────────
-- Table: notification_logs
-- Audit log for every email / SMS send attempt.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_logs (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    user_id           INT           NULL,              -- student or coach id (nullable for system/manual)
    user_role         ENUM('Student','Coach','Admin')  DEFAULT 'Student',
    notification_type VARCHAR(100)  NOT NULL,          -- e.g. 'ResultPublished', 'CertificateReady', 'Welcome'
    channel           ENUM('Email')                    DEFAULT 'Email',
    recipient         VARCHAR(255)  NOT NULL,          -- email address or phone number
    subject           VARCHAR(255)  NULL,
    message           TEXT          NULL,
    status            ENUM('Sent','Failed','Pending')  DEFAULT 'Pending',
    error_message     TEXT          NULL,
    sent_at           TIMESTAMP     NULL,
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
