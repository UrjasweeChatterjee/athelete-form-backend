// ─────────────────────────────────────────────────────────────
// utils/receiptGenerator.js  –  PDF Payment Receipt Generator
//
// Uses PDFKit (already installed).
// Generates a clean, professional A4 portrait receipt.
// Saves to: uploads/receipts/payment-receipt-{id}.pdf
// Returns relative path for DB storage.
// ─────────────────────────────────────────────────────────────

const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

const RECEIPT_DIR = path.join(__dirname, '..', 'uploads', 'receipts');
if (!fs.existsSync(RECEIPT_DIR)) {
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
}

/**
 * Generate a PDF payment receipt.
 *
 * @param {object} data
 * @param {number} data.paymentId           - payments.id
 * @param {string} data.studentName         - student full name
 * @param {string} data.studentEmail        - student email
 * @param {string} data.competitionName     - competition name
 * @param {string} data.feeType             - 'Registration Fee' | 'Competition Fee'
 * @param {number|string} data.amount       - amount (e.g. 500)
 * @param {string} data.currency            - 'INR'
 * @param {string} data.razorpayOrderId     - Razorpay order ID
 * @param {string} data.razorpayPaymentId   - Razorpay payment ID
 * @param {Date|string} data.paidAt         - payment timestamp
 *
 * @returns {Promise<string>} relative file path, e.g. uploads/receipts/payment-receipt-42.pdf
 */
const generateReceipt = (data) => {
  return new Promise((resolve, reject) => {
    const {
      paymentId,
      studentName,
      studentEmail,
      competitionName,
      feeType,
      amount,
      currency,
      razorpayOrderId,
      razorpayPaymentId,
      paidAt,
    } = data;

    const filename    = `payment-receipt-${paymentId}.pdf`;
    const filePath    = path.join(RECEIPT_DIR, filename);
    const relPath     = `uploads/receipts/${filename}`;
    const receiptNo   = `SCM-PAY-${String(paymentId).padStart(6, '0')}`;
    const generatedAt = new Date().toLocaleString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const paidDate = paidAt ? new Date(paidAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) : generatedAt;

    const formattedAmount = `${currency || 'INR'} ₹${parseFloat(amount).toFixed(2)}`;

    // A4 portrait
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const W = 595.28;
    const H = 841.89;

    // ── Background ────────────────────────────────────────────
    doc.rect(0, 0, W, H).fill('#0A0A12');

    // ── Header band ───────────────────────────────────────────
    doc.rect(0, 0, W, 110).fill('#111827');
    // Lime accent line
    doc.rect(0, 108, W, 3).fill('#d4ff00');

    // Club name
    doc.font('Helvetica-Bold').fontSize(11)
       .fillColor('#d4ff00')
       .text('⚡  SPORTS CLUB MANAGEMENT PLATFORM', 0, 30, {
         align: 'center', width: W, characterSpacing: 1.5,
       });

    // "Payment Receipt" title
    doc.font('Helvetica-Bold').fontSize(22)
       .fillColor('#e2e4cf')
       .text('PAYMENT RECEIPT', 0, 54, { align: 'center', width: W, characterSpacing: 1 });

    // Receipt number
    doc.font('Helvetica').fontSize(9)
       .fillColor('rgba(197,201,172,0.55)')
       .text(`Receipt No: ${receiptNo}`, 0, 84, { align: 'center', width: W });

    // ── Status badge ──────────────────────────────────────────
    const badgeX = W / 2 - 50;
    doc.roundedRect(badgeX, 125, 100, 26, 13).fill('rgba(52,211,153,0.12)');
    doc.roundedRect(badgeX, 125, 100, 26, 13).strokeColor('rgba(52,211,153,0.4)').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(9)
       .fillColor('#34D399')
       .text('✓  PAYMENT SUCCESSFUL', badgeX, 133, { width: 100, align: 'center' });

    // ── Detail rows ───────────────────────────────────────────
    const rowStart   = 178;
    const rowHeight  = 42;
    const labelX     = 56;
    const valueX     = 230;
    const rowW       = W - 112;

    const rows = [
      { label: 'Student Name',       value: studentName || '—' },
      { label: 'Student Email',      value: studentEmail || '—' },
      { label: 'Competition',        value: competitionName || '—' },
      { label: 'Fee Type',           value: feeType || 'Competition Fee' },
      { label: 'Amount Paid',        value: formattedAmount, highlight: true },
      { label: 'Payment Status',     value: 'Paid', status: true },
      { label: 'Razorpay Order ID',  value: razorpayOrderId || '—' },
      { label: 'Razorpay Pay. ID',   value: razorpayPaymentId || '—' },
      { label: 'Payment Date',       value: paidDate },
      { label: 'Generated On',       value: generatedAt },
    ];

    rows.forEach((row, i) => {
      const y    = rowStart + i * rowHeight;
      const even = i % 2 === 0;

      // Row background
      doc.rect(labelX - 8, y - 4, rowW + 16, rowHeight)
         .fill(even ? 'rgba(255,255,255,0.02)' : 'transparent');

      // Bottom border
      doc.moveTo(labelX, y + rowHeight - 5)
         .lineTo(labelX + rowW, y + rowHeight - 5)
         .lineWidth(0.5)
         .strokeColor('rgba(255,255,255,0.05)')
         .stroke();

      // Label
      doc.font('Helvetica').fontSize(9)
         .fillColor('rgba(197,201,172,0.5)')
         .text(row.label.toUpperCase(), labelX, y + 6, { width: 160, characterSpacing: 0.5 });

      // Value
      const valueColor = row.highlight ? '#d4ff00'
                       : row.status    ? '#34D399'
                       :                 '#e2e4cf';
      const valueFontSize = row.highlight ? 12 : 9.5;

      doc.font(row.highlight || row.status ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(valueFontSize)
         .fillColor(valueColor)
         .text(row.value, valueX, y + (row.highlight ? 4 : 6), { width: 310 });
    });

    // ── Divider before footer ─────────────────────────────────
    const footerY = rowStart + rows.length * rowHeight + 20;
    doc.moveTo(labelX, footerY).lineTo(W - labelX, footerY)
       .lineWidth(1).strokeColor('rgba(212,255,0,0.2)').stroke();

    // ── Footer ────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(8)
       .fillColor('rgba(197,201,172,0.35)')
       .text(
         'This is a computer-generated receipt and does not require a signature.\n' +
         'For any queries, please contact your club administrator.',
         labelX, footerY + 16, { width: rowW, align: 'center' }
       );

    // Bottom lime bar
    doc.rect(0, H - 6, W, 6).fill('#d4ff00');

    // ── Finish ────────────────────────────────────────────────
    doc.end();

    writeStream.on('finish', () => {
      console.log(`🧾  Receipt generated: ${relPath}`);
      resolve(relPath);
    });
    writeStream.on('error', (err) => {
      console.error('❌  Receipt generation failed:', err.message);
      reject(err);
    });
  });
};

module.exports = { generateReceipt };
