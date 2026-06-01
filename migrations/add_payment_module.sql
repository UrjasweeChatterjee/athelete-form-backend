-- ============================================================
-- Sports Club Management Platform
-- Payment Module Migration
-- ============================================================
-- Run ONCE against sports_club_db.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

USE sports_club_db;

CREATE TABLE IF NOT EXISTS payments (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    student_id            INT             NOT NULL,
    competition_name      VARCHAR(255)    NULL,
    fee_type              ENUM('Registration Fee','Competition Fee') DEFAULT 'Competition Fee',
    amount                DECIMAL(10,2)   NOT NULL,
    currency              VARCHAR(10)     DEFAULT 'INR',
    payment_status        ENUM('Pending','Paid','Failed')            DEFAULT 'Pending',

    -- Razorpay references (never store card/UPI/bank details)
    razorpay_order_id     VARCHAR(255)    NULL,
    razorpay_payment_id   VARCHAR(255)    NULL,
    razorpay_signature    VARCHAR(512)    NULL,

    -- Receipt
    receipt_url           VARCHAR(500)    NULL,

    -- Failure info
    failure_reason        TEXT            NULL,

    -- Timestamps
    paid_at               TIMESTAMP       NULL,
    created_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Indexes for common queries
    INDEX idx_student_id      (student_id),
    INDEX idx_payment_status  (payment_status),
    INDEX idx_razorpay_order  (razorpay_order_id),
    INDEX idx_created_at      (created_at)
);
