// ─────────────────────────────────────────────────────────────
// utils/notificationService.js  –  Centralised notification system
//
// All notifications are handled via EMAIL only.
// Wraps the existing mailer.js SMTP config with higher-level
// event-specific functions AND logs every attempt to the
// notification_logs database table.
//
// IMPORTANT:
//  - Email failures NEVER throw / crash the server.
//  - Every attempt (success or failure) is logged.
// ─────────────────────────────────────────────────────────────

const nodemailer = require('nodemailer');
const db         = require('../db');
require('dotenv').config();

// ── SMTP Transporter (reuses same config as mailer.js) ────────
const transporter = nodemailer.createTransport({
  host:    process.env.MAIL_HOST || 'smtp.gmail.com',
  port:    parseInt(process.env.MAIL_PORT) || 587,
  secure:  false,
  pool:    true,          // Reuse SMTP connections (faster subsequent sends)
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 1000,        // Throttle: max 'rateLimit' messages per 'rateDelta' ms
  rateLimit: 10,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed or chain-incomplete TLS certs
  },
});

// ── Helper: log notification attempt to DB ────────────────────
const logNotification = async ({ user_id, user_role, notification_type, channel, recipient, subject, message, status, error_message }) => {
  try {
    await db.execute(
      `INSERT INTO notification_logs
         (user_id, user_role, notification_type, channel, recipient, subject, message, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id   || null,
        user_role || 'Student',
        notification_type,
        channel   || 'Email',
        recipient,
        subject   || null,
        message   || null,
        status,
        error_message || null,
        status === 'Sent' ? new Date() : null,
      ]
    );
  } catch (logErr) {
    // Never crash on log failure
    console.error('⚠️  Failed to write notification log:', logErr.message);
  }
};

// ── Core: sendEmail ───────────────────────────────────────────
/**
 * Send an email and log the result.
 * @param {string} to          - recipient email
 * @param {string} subject     - email subject
 * @param {string} html        - HTML body
 * @param {object} meta        - { user_id, user_role, notification_type }
 * @returns {boolean}          - true if sent successfully
 */
const sendEmail = async (to, subject, html, meta = {}) => {
  const { user_id, user_role = 'Student', notification_type = 'General' } = meta;

  const mailOptions = {
    from: process.env.MAIL_FROM || `"Sports Club Management" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧  [${notification_type}] Email sent to ${to}: ${info.messageId}`);

    await logNotification({
      user_id, user_role, notification_type,
      channel:   'Email',
      recipient: to,
      subject,
      message:   html.replace(/<[^>]+>/g, '').substring(0, 500), // plain text excerpt
      status:    'Sent',
    });
    return true;
  } catch (err) {
    console.error(`❌  [${notification_type}] Email to ${to} failed:`, err.message);

    await logNotification({
      user_id, user_role, notification_type,
      channel:       'Email',
      recipient:     to,
      subject,
      message:       html.replace(/<[^>]+>/g, '').substring(0, 500),
      status:        'Failed',
      error_message: err.message,
    });
    return false;
  }
};

// ── HTML email wrapper ────────────────────────────────────────
const emailWrapper = (content) => `
  <div style="font-family:'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:30px auto;background:#0A0A12;color:#e2e4cf;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);box-shadow:0 20px 50px rgba(0,0,0,0.5);">
    <!-- Brand Header -->
    <div style="background:linear-gradient(135deg,#0d0d1e 0%,#111827 100%);padding:28px 36px;border-bottom:2.5px solid #d4ff00;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h2 style="margin:0;color:#d4ff00;font-size:1.15rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
          &#9889; Sports Club
        </h2>
        <span style="color:#06b6d4;font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Sports Club Hub</span>
      </div>
    </div>
    
    <!-- Body Content Area -->
    <div style="padding:40px 36px;background-image:radial-gradient(circle at 90% 10%, rgba(6,182,212,0.02) 0%, transparent 60%);">
      ${content}
      
      <!-- Footer details -->
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:32px 0;" />
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <p style="color:rgba(197,201,172,0.45);font-size:0.75rem;line-height:1.5;margin:0;">
          This is an automated operational transmission from Sports Club.<br/>
          To protect security, please do not reply directly to this inbox.
        </p>
      </div>
    </div>
  </div>
`;

// ── Specific Email Functions ───────────────────────────────────

/** Welcome email after student registration */
const sendWelcomeEmail = async (student) => {
  const subject = '🎉 Welcome to Sports Club Management Platform!';
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>Welcome to the <strong>Sports Club Management Platform</strong>!</p>
    <p>Your registration has been received and is currently under review by our coaching team.</p>
    <div style="background:rgba(212,255,0,0.05);border:1px solid rgba(212,255,0,0.2);border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>Your Athlete ID:</strong> SCM-${String(student.id || 0).padStart(6, '0')}</p>
      <p style="margin:0;"><strong>Email:</strong> ${student.email}</p>
    </div>
    <p>You will receive an email once your application is reviewed. Stay tuned! 🏆</p>
    <p>Best regards,<br/><strong style="color:#06b6d4;">Sports Club Management Team</strong></p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'Welcome' });
};

/** OTP email */
const sendOtpEmail = async (student, otp) => {
  const subject = '🔐 Your OTP – Sports Club Management';
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>Your One-Time Password (OTP) is:</p>
    <div style="background:rgba(6,182,212,0.08);border:2px solid #06b6d4;border-radius:12px;padding:24px;text-align:center;margin:16px 0;">
      <span style="font-size:2rem;font-weight:900;letter-spacing:0.3em;color:#06b6d4;">${otp}</span>
    </div>
    <p>This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'OTP' });
};

/** Document status (approved/rejected) email */
const sendDocumentStatusEmail = async (student, documentName, status, reason) => {
  const isApproved = status === 'Approved';
  const subject = `📄 Document ${status}: ${documentName}`;
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>Your document <strong>${documentName}</strong> has been <strong style="color:${isApproved ? '#34D399' : '#ffb4ab'};">${status}</strong>.</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    <p>Please login to your dashboard to view the full status of your application.</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'DocumentStatus' });
};

/** Competition registration confirmation */
const sendCompetitionRegistrationEmail = async (student, competition) => {
  const subject = `🏅 Competition Registration Confirmed: ${competition.name || competition.competition_name}`;
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>You have been successfully registered for the following competition:</p>
    <div style="background:rgba(212,255,0,0.05);border:1px solid rgba(212,255,0,0.2);border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>Competition:</strong> ${competition.name || competition.competition_name}</p>
      ${competition.date || competition.competition_date ? `<p style="margin:0 0 8px;"><strong>Date:</strong> ${competition.date || competition.competition_date}</p>` : ''}
      ${competition.category_level ? `<p style="margin:0;"><strong>Category:</strong> ${competition.category_level}</p>` : ''}
    </div>
    <p>Give it your best shot! 💪</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'CompetitionRegistration' });
};

/** Payment success email */
const sendPaymentSuccessEmail = async (student, payment) => {
  const subject = '✅ Payment Successful – Sports Club Management';
  const receiptSection = payment.receipt_link
    ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${payment.receipt_link}" style="display:inline-block;background:#d4ff00;color:#0A0A12;font-weight:700;padding:12px 28px;border-radius:9999px;text-decoration:none;font-size:0.95rem;">
        📥 Download Receipt
      </a>
    </div>`
    : '';

  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>🎉 Your payment has been <strong style="color:#34D399;">received successfully!</strong></p>
    <div style="background:rgba(52,211,153,0.05);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 10px;"><strong>Competition:</strong> ${payment.competition_name || '—'}</p>
      <p style="margin:0 0 10px;"><strong>Fee Type:</strong> ${payment.fee_type || 'Competition Fee'}</p>
      <p style="margin:0 0 10px;"><strong>Amount Paid:</strong> <span style="color:#d4ff00;font-size:1.1em;font-weight:700;">₹${parseFloat(payment.amount || 0).toFixed(2)}</span></p>
      <p style="margin:0 0 10px;"><strong>Razorpay Payment ID:</strong> ${payment.razorpay_payment_id || '—'}</p>
      <p style="margin:0;"><strong>Status:</strong> <span style="color:#34D399;font-weight:700;">Paid ✓</span></p>
    </div>
    ${receiptSection}
    <p>Your payment receipt is available for download from your Athlete Dashboard under <strong>My Payments</strong>.</p>
    <p>Thank you for your payment. You are all set for the competition! 🏆</p>
    <p>Best regards,<br/><strong style="color:#06b6d4;">Sports Club Management Team</strong></p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'PaymentSuccess' });
};

/** Tournament registration confirmation email */
const sendTournamentRegistrationEmail = async (student, tournament) => {
  const subject = `🏆 Tournament Registration Confirmed – ${tournament.name}`;

  const eventDate = tournament.event_date
    ? new Date(tournament.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>🎉 You have been <strong style="color:#34D399;">successfully registered</strong> for the following tournament!</p>
    <div style="background:rgba(212,255,0,0.05);border:1px solid rgba(212,255,0,0.2);border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 10px;"><strong style="color:#d4ff00;">🏆 Tournament:</strong> <span style="color:#e2e4cf;font-size:1.05em;">${tournament.name}</span></p>
      ${tournament.sport ? `<p style="margin:0 0 10px;"><strong>Sport:</strong> ${tournament.sport}</p>` : ''}
      ${eventDate ? `<p style="margin:0 0 10px;"><strong>📅 Event Date:</strong> ${eventDate}</p>` : ''}
      ${tournament.description ? `<p style="margin:0 0 10px;"><strong>Details:</strong> ${tournament.description}</p>` : ''}
      <p style="margin:0 0 10px;"><strong>Registration Fee Paid:</strong> <span style="color:#d4ff00;font-size:1.1em;font-weight:700;">₹${parseFloat(tournament.fee_amount || 0).toFixed(2)}</span></p>
      <p style="margin:0;"><strong>Status:</strong> <span style="color:#34D399;font-weight:700;">Registered ✓</span></p>
    </div>
    <p style="color:rgba(197,201,172,0.8);">Your spot has been secured! Please ensure you arrive on time on the event day.</p>
    <p style="color:rgba(197,201,172,0.8);">You can view your registration details under <strong>Upcoming Tournaments</strong> in your Athlete Dashboard.</p>
    <p style="margin-top:20px;">Give it your best shot! 💪🏅</p>
    <p>Best regards,<br/><strong style="color:#06b6d4;">Sports Club Management Team</strong></p>
  `);

  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'TournamentRegistration' });
};

/** Payment failed email */
const sendPaymentFailedEmail = async (student, payment) => {
  const subject = '❌ Payment Failed – Sports Club Management';
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>Unfortunately, your payment could <strong style="color:#ffb4ab;">not be processed</strong>.</p>
    <div style="background:rgba(255,180,171,0.05);border:1px solid rgba(255,180,171,0.2);border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 10px;"><strong>Competition:</strong> ${payment.competition_name || '—'}</p>
      <p style="margin:0 0 10px;"><strong>Fee Type:</strong> ${payment.fee_type || 'Competition Fee'}</p>
      <p style="margin:0 0 10px;"><strong>Amount:</strong> ₹${parseFloat(payment.amount || 0).toFixed(2)}</p>
      ${payment.failure_reason ? `<p style="margin:0;"><strong>Reason:</strong> ${payment.failure_reason}</p>` : ''}
    </div>
    <p>Please login to your <strong>Athlete Dashboard → My Payments</strong> and click <strong>Pay Now</strong> to retry your payment.</p>
    <p>If the issue persists, please contact your coach or administrator.</p>
    <p>Best regards,<br/><strong style="color:#06b6d4;">Sports Club Management Team</strong></p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'PaymentFailed' });
};

/** Upcoming event/competition reminder */
const sendUpcomingEventReminder = async (student, competition, reminderType = '24h') => {
  const subject = `⏰ Reminder: ${competition.competition_name} is coming up!`;
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>This is a friendly reminder that your upcoming competition is in <strong style="color:#06b6d4;">${reminderType === '48h' ? '48 hours' : '24 hours'}</strong>!</p>
    <div style="background:rgba(6,182,212,0.05);border:1px solid rgba(6,182,212,0.2);border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>Competition:</strong> ${competition.competition_name}</p>
      <p style="margin:0 0 8px;"><strong>Date:</strong> ${competition.competition_date}</p>
      ${competition.category_level ? `<p style="margin:0;"><strong>Category:</strong> ${competition.category_level}</p>` : ''}
    </div>
    <p>Prepare well and give it your all! 🏆</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'EventReminder' });
};

/** Pending fee reminder */
const sendPendingFeeReminder = async (student, competition) => {
  // Update query in reminderJobs.js when payment table is available
  const subject = '💳 Pending Fee Reminder – Sports Club Management';
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>This is a reminder that you have a <strong style="color:#FBBF24;">pending fee payment</strong> for your competition registration.</p>
    <p>Please login to your dashboard and complete the payment to confirm your spot.</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'PendingFee' });
};

/** Missing document alert */
const sendMissingDocumentAlert = async (student, missingDocuments) => {
  const subject = '📋 Missing Documents – Action Required';
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>The following documents are <strong style="color:#ffb4ab;">missing</strong> from your registration profile:</p>
    <ul style="color:#e2e4cf;">
      ${(missingDocuments || []).map(doc => `<li>${doc}</li>`).join('')}
    </ul>
    <p>Please login and upload the required documents to complete your application.</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'MissingDocument' });
};

/** Results published email */
const sendResultsPublishedEmail = async (student, competition, certificateLink = null) => {
  const subject = `🏆 Results Published: ${competition.competition_name}`;
  
  const certSection = certificateLink
    ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${certificateLink}" style="display:inline-block;background:#d4ff00;color:#0A0A12;font-weight:700;padding:12px 28px;border-radius:9999px;text-decoration:none;font-size:0.95rem;">
        📥 Download Certificate
      </a>
    </div>`
    : '';

  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>The results for <strong>${competition.competition_name}</strong> have been published!</p>
    ${competition.competition_date ? `<p><strong>Date:</strong> ${competition.competition_date}</p>` : ''}
    <div style="background:rgba(212,255,0,0.05);border:1px solid rgba(212,255,0,0.2);border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>Your Result:</strong> ${competition.result_text || 'Participant'}</p>
      <p style="margin:0;"><strong>Medal:</strong> ${competition.medal_won || 'None'}</p>
    </div>
    ${certSection}
    <p>Login to your athlete dashboard to view your full result and download your certificate.</p>
    <p>Well done for participating! 🎉</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'ResultPublished' });
};

/** Certificate available email */
const sendCertificateAvailableEmail = async (student, certificateLink) => {
  const subject = '🎖️ Your Certificate is Ready – Sports Club Management';
  const html = emailWrapper(`
    <p>Dear <strong style="color:#d4ff00;">${student.full_name}</strong>,</p>
    <p>Great news! Your achievement certificate is now ready to download.</p>
    <p>Login to your <strong>Athlete Dashboard → My Achievements</strong> to download your certificate.</p>
    ${certificateLink ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${certificateLink}" style="display:inline-block;background:#d4ff00;color:#0A0A12;font-weight:700;padding:12px 28px;border-radius:9999px;text-decoration:none;font-size:0.95rem;">
        📥 Download Certificate
      </a>
    </div>
    ` : ''}
    <p>Congratulations on your achievement! 🏆</p>
  `);
  return sendEmail(student.email, subject, html, { user_id: student.id, user_role: 'Student', notification_type: 'CertificateReady' });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendOtpEmail,
  sendDocumentStatusEmail,
  sendCompetitionRegistrationEmail,
  sendTournamentRegistrationEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendUpcomingEventReminder,
  sendPendingFeeReminder,
  sendMissingDocumentAlert,
  sendResultsPublishedEmail,
  sendCertificateAvailableEmail,
  logNotification,
};
