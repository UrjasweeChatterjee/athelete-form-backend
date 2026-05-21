// ─────────────────────────────────────────────────────────────
// utils/mailer.js  –  Nodemailer email utility
// Sends approval / rejection emails to students.
// ─────────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable SMTP transporter
const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.MAIL_PORT) || 587,
  secure: false, // true for port 465, false for 587
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Send an approval or rejection email to a student.
 * @param {string} toEmail   - Student's email address
 * @param {string} toName    - Student's full name
 * @param {string} status    - 'Approved' | 'Rejected'
 */
const sendStatusEmail = async (toEmail, toName, status) => {
  const isApproved = status === 'Approved';

  const subject = isApproved
    ? '🎉 Congratulations! Your Application has been Approved'
    : 'Application Status Update – Sports Club Management';

  const html = isApproved
    ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#0d47a1;">Sports Club Management Platform</h2>
        <hr style="border-color:#e0e0e0;" />
        <p>Dear <strong>${toName}</strong>,</p>
        <p>We are thrilled to inform you that your athlete registration application has been <strong style="color:#2e7d32;">Approved</strong>.</p>
        <p>You are now an official member of our sports club. Please login to your student dashboard to view your updated status.</p>
        <br/>
        <p style="color:#546e7a;">If you have any questions, please contact your coach.</p>
        <br/>
        <p>Warm regards,<br/><strong>Sports Club Management Team</strong></p>
      </div>
    `
    : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#0d47a1;">Sports Club Management Platform</h2>
        <hr style="border-color:#e0e0e0;" />
        <p>Dear <strong>${toName}</strong>,</p>
        <p>Thank you for submitting your athlete registration application.</p>
        <p>After careful review, we regret to inform you that your application has been <strong style="color:#c62828;">Rejected</strong> at this time.</p>
        <p>Please contact your coach for more information regarding the decision.</p>
        <br/>
        <p style="color:#546e7a;">You may reapply after addressing any issues with your application.</p>
        <br/>
        <p>Regards,<br/><strong>Sports Club Management Team</strong></p>
      </div>
    `;

  const mailOptions = {
    from: `"Sports Club Management" <${process.env.MAIL_USER}>`,
    to:   toEmail,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧  Email sent to ${toEmail}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌  Email send failed:', error.message);
    return false;
  }
};

module.exports = { sendStatusEmail };
