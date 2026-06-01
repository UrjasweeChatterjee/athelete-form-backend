// ─────────────────────────────────────────────────────────────
// jobs/reminderJobs.js  –  Scheduled Reminder Jobs (node-cron)
//
// Runs three daily jobs at 8:00 AM:
//  1. Upcoming event reminders (48h and 24h before competition)
//  2. Pending fee reminders
//  3. Missing document alerts
//
// IMPORTANT: Update the placeholder queries below if/when your
// database gains payment or dedicated competition tables.
// These jobs are designed to be SAFE — they will not crash the
// server even if queries return no results.
// ─────────────────────────────────────────────────────────────

const cron = require('node-cron');
const db   = require('../db');
const {
  sendUpcomingEventReminder,
  sendPendingFeeReminder,
  sendMissingDocumentAlert,
} = require('../utils/notificationService');

// ── Job 1: Upcoming Event Reminders ───────────────────────────
// Finds competitions happening in exactly 24h or 48h from now
// and sends reminders to registered students.
const runUpcomingEventReminders = async () => {
  console.log('🕐  [Job] Running upcoming event reminders...');
  try {
    // Update this query based on actual competition/payment table if available.
    // Currently queries competition_results for Published competitions
    // where competition_date is within the next 48 hours.
    const [records] = await db.execute(
      `SELECT cr.id, cr.competition_name, cr.competition_date, cr.student_id,
              s.full_name, s.email
       FROM competition_results cr
       LEFT JOIN students s ON s.id = cr.student_id
       WHERE cr.competition_date BETWEEN DATE_ADD(NOW(), INTERVAL 1 DAY)
                                      AND DATE_ADD(NOW(), INTERVAL 2 DAY)
         AND cr.result_status = 'Published'
         AND s.email IS NOT NULL`
    );

    console.log(`📅  [Job] Found ${records.length} upcoming event(s) to remind.`);

    for (const record of records) {
      const student = { id: record.student_id, full_name: record.full_name, email: record.email };
      const competition = {
        competition_name: record.competition_name,
        competition_date: record.competition_date,
      };
      await sendUpcomingEventReminder(student, competition, '48h');
    }
  } catch (err) {
    // Never crash the server — log and continue
    console.error('❌  [Job] Upcoming event reminder error:', err.message);
  }
};

// ── Job 2: Pending Fee Reminders ──────────────────────────────
// Update the query below when payment_status field/table is available.
const runPendingFeeReminders = async () => {
  console.log('🕐  [Job] Running pending fee reminders...');
  try {
    // TODO: Update this query based on actual payment table if available.
    // Example: SELECT * FROM payments WHERE payment_status = 'Pending' AND deadline < DATE_ADD(NOW(), INTERVAL 3 DAY)
    // For now, this is a placeholder that safely returns zero rows.
    const [students] = await db.execute(
      `SELECT id, full_name, email FROM students WHERE status = 'Pending' AND email IS NOT NULL LIMIT 10`
    );

    // Only send if there's a real pending fee scenario
    // This block is intentionally a placeholder. Uncomment and adapt when payment module is added.
    /*
    for (const student of students) {
      await sendPendingFeeReminder(student, {});
    }
    */
    console.log(`💳  [Job] Pending fee reminder: ${students.length} students found (placeholder — skipping send).`);
  } catch (err) {
    console.error('❌  [Job] Pending fee reminder error:', err.message);
  }
};

// ── Job 3: Missing Document Alerts ────────────────────────────
// Find approved students still missing key documents.
const runMissingDocumentAlerts = async () => {
  console.log('🕐  [Job] Running missing document alerts...');
  try {
    const [students] = await db.execute(
      `SELECT id, full_name, email, photo, birth_certificate, id_proof
       FROM students
       WHERE status = 'Approved'
         AND (photo IS NULL OR birth_certificate IS NULL OR id_proof IS NULL)
         AND email IS NOT NULL`
    );

    console.log(`📋  [Job] Found ${students.length} student(s) with missing documents.`);

    for (const student of students) {
      const missing = [];
      if (!student.photo)             missing.push('Profile Photo');
      if (!student.birth_certificate) missing.push('Birth Certificate');
      if (!student.id_proof)          missing.push('ID Proof');

      if (missing.length > 0) {
        await sendMissingDocumentAlert(student, missing);
      }
    }
  } catch (err) {
    console.error('❌  [Job] Missing document alert error:', err.message);
  }
};

// ── Schedule all jobs ─────────────────────────────────────────
const startReminderJobs = () => {
  // Run every day at 8:00 AM
  // Cron format: minute hour day-of-month month day-of-week
  cron.schedule('0 8 * * *', async () => {
    console.log('\n🔔  [CRON] Daily reminder jobs starting at', new Date().toISOString());
    await runUpcomingEventReminders();
    await runPendingFeeReminders();
    await runMissingDocumentAlerts();
    console.log('✅  [CRON] Daily reminder jobs completed.\n');
  }, {
    timezone: 'Asia/Kolkata', // IST — change if needed
  });

  console.log('⏰  Reminder jobs scheduled: Daily at 8:00 AM IST');
};

module.exports = { startReminderJobs };
