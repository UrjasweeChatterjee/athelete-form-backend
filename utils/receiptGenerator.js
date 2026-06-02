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

    const formattedAmount = `${currency || 'INR'} Rs ${parseFloat(amount).toFixed(2)}`;

    // A4 portrait
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const W = 595.28;
    const H = 841.89;

    // ── Background & Watermark Grid ──────────────────────────
    doc.rect(0, 0, W, H).fill('#08080E');
    doc.lineWidth(0.5);
    doc.strokeColor('rgba(212,255,0,0.015)');
    for (let x = 0; x < W; x += 30) {
      doc.moveTo(x, 0).lineTo(x, H).stroke();
    }
    for (let y = 0; y < H; y += 30) {
      doc.moveTo(0, y).lineTo(W, y).stroke();
    }

    // ── Header band ───────────────────────────────────────────
    doc.rect(0, 0, W, 110).fill('#111422');
    // Lime brand border
    doc.rect(0, 108, W, 3).fill('#d4ff00');

    // Club name
    doc.font('Helvetica-Bold').fontSize(10.5)
       .fillColor('#d4ff00')
       .text('SPORTS CLUB MANAGEMENT PLATFORM', 0, 30, {
         align: 'center', width: W, characterSpacing: 1.5,
       });

    // "Payment Receipt" title
    doc.font('Helvetica-Bold').fontSize(22)
       .fillColor('#e2e4cf')
       .text('PAYMENT RECEIPT', 0, 54, { align: 'center', width: W, characterSpacing: 1 });

    // Receipt number
    doc.font('Helvetica').fontSize(9)
       .fillColor('rgba(197,201,172,0.55)')
       .text(`Receipt Reference: ${receiptNo}`, 0, 84, { align: 'center', width: W });

    // ── Status badge ──────────────────────────────────────────
    const badgeX = W / 2 - 60;
    doc.roundedRect(badgeX, 125, 120, 26, 6).fill('rgba(52,211,153,0.08)');
    doc.roundedRect(badgeX, 125, 120, 26, 6).strokeColor('rgba(52,211,153,0.35)').lineWidth(0.8).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5)
       .fillColor('#34D399')
       .text('PAYMENT SUCCESSFUL', badgeX, 134, { width: 120, align: 'center' });

    // ── Invoice Details Layout ────────────────────────────────
    const startY = 175;
    const paddingX = 45;
    const blockW = W - paddingX * 2;

    // Student Info Block
    doc.rect(paddingX, startY, blockW, 55)
       .fill('rgba(255,255,255,0.02)')
       .strokeColor('rgba(255,255,255,0.05)').lineWidth(0.8).stroke();
       
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#06b6d4').text('BILL TO:', paddingX + 15, startY + 12);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#e2e4cf').text(studentName || 'Athlete', paddingX + 15, startY + 28);
    doc.font('Helvetica').fontSize(9.5).fillColor('rgba(197,201,172,0.65)').text(studentEmail || '', paddingX + 220, startY + 28, { width: blockW - 240, align: 'right' });

    // Itemized Table Shaded Header
    const tableY = startY + 75;
    doc.rect(paddingX, tableY, blockW, 25).fill('#111422');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('rgba(197,201,172,0.85)');
    doc.text('ITEM DESCRIPTION', paddingX + 15, tableY + 8, { characterSpacing: 0.5 });
    doc.text('ORDER & REFERENCE DETAILS', paddingX + 200, tableY + 8, { characterSpacing: 0.5 });
    doc.text('TOTAL PAID', paddingX + 410, tableY + 8, { width: 80, align: 'right', characterSpacing: 0.5 });

    // Table Content Items
    const contentRows = [
      { desc: `${feeType || 'Competition Fee'} - ${competitionName || 'Event Fee'}`, refLabel: 'Order Ref:', refVal: razorpayOrderId || '—' },
      { desc: 'Transaction Method: Razorpay Gateway', refLabel: 'Payment ID:', refVal: razorpayPaymentId || '—' },
      { desc: `Payment Settled: ${paidDate}`, refLabel: 'Settlement Date:', refVal: paidDate },
      { desc: `Receipt Document generated on ${generatedAt}`, refLabel: 'Status:', refVal: 'PAID / SETTLED', isStatus: true }
    ];

    const rowH = 34;
    contentRows.forEach((item, index) => {
      const currentY = tableY + 25 + index * rowH;
      
      // Zebra shading
      if (index % 2 === 0) {
        doc.rect(paddingX, currentY, blockW, rowH).fill('rgba(255,255,255,0.01)');
      }

      // Thin bottom border
      doc.moveTo(paddingX, currentY + rowH).lineTo(paddingX + blockW, currentY + rowH)
         .lineWidth(0.5).strokeColor('rgba(255,255,255,0.05)').stroke();

      // Description
      doc.font('Helvetica').fontSize(9).fillColor('#e2e4cf').text(item.desc, paddingX + 15, currentY + 11, { width: 175 });

      // Reference fields
      doc.font('Helvetica').fontSize(8).fillColor('rgba(197,201,172,0.5)').text(item.refLabel, paddingX + 200, currentY + 12);
      
      const valColor = item.isStatus ? '#34D399' : '#e2e4cf';
      doc.font(item.isStatus ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(valColor).text(item.refVal, paddingX + 265, currentY + 12, { width: 135 });
    });

    // Total Amount Highlight Row
    const totalRowY = tableY + 25 + contentRows.length * rowH;
    doc.rect(paddingX, totalRowY, blockW, rowH + 8).fill('rgba(212,255,0,0.02)');
    doc.rect(paddingX, totalRowY, blockW, rowH + 8).strokeColor('rgba(212,255,0,0.1)').lineWidth(0.8).stroke();
    
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#d4ff00').text('TOTAL AMOUNT RECEIVED:', paddingX + 15, totalRowY + 13);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#d4ff00').text(formattedAmount, paddingX + 380, totalRowY + 11, { width: 110, align: 'right' });

    // ── Signatory & Paid Seal Section ─────────────────────────
    const sigBlockY = totalRowY + rowH + 45;

    // Authorized Seal (Left)
    const sealX = paddingX + 60;
    const sealY = sigBlockY + 20;
    doc.circle(sealX, sealY, 26).lineWidth(1.2).strokeColor('rgba(52,211,153,0.4)').stroke();
    doc.circle(sealX, sealY, 22).lineWidth(0.8).strokeColor('rgba(52,211,153,0.2)').stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#34D399').text('PAID', sealX - 20, sealY - 5, { width: 40, align: 'center', characterSpacing: 1 });

    // Accounts Signature (Right)
    const accountsSigX = W - paddingX - 160;
    const accountsSigY = sigBlockY + 20;

    // Simulated signature cursive script
    doc.font('Times-BoldItalic').fontSize(15).fillColor('#06b6d4')
       .text('E. Sterling', accountsSigX, accountsSigY - 14, { width: 140, align: 'center' });
    // Pen stroke
    doc.moveTo(accountsSigX + 10, accountsSigY - 4)
       .bezierCurveTo(accountsSigX + 40, accountsSigY - 15, accountsSigX + 80, accountsSigY + 5, accountsSigX + 130, accountsSigY - 6)
       .lineWidth(1).strokeColor('rgba(6,182,212,0.5)').stroke();

    doc.moveTo(accountsSigX, accountsSigY).lineTo(accountsSigX + 140, accountsSigY)
       .lineWidth(1).strokeColor('rgba(255,255,255,0.15)').stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor('rgba(197,201,172,0.5)')
       .text('Authorized Signatory', accountsSigX, accountsSigY + 8, { width: 140, align: 'center' });

    // ── Divider before footer ─────────────────────────────────
    const footerY = H - 85;
    doc.moveTo(paddingX, footerY).lineTo(W - paddingX, footerY)
       .lineWidth(0.8).strokeColor('rgba(212,255,0,0.15)').stroke();

    // ── Footer ────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(8)
       .fillColor('rgba(197,201,172,0.4)')
       .text(
         'This is an officially processed electronic receipt from the Sports Club Management Platform.\n' +
         'All transactions are secured and settled via Razorpay API. No physical signature is required.',
         paddingX, footerY + 14, { width: blockW, align: 'center', lineGap: 3 }
       );

    // Bottom lime bar
    doc.rect(0, H - 6, W, 6).fill('#d4ff00');

    // ── Finish ────────────────────────────────────────────────
    doc.end();

    writeStream.on('finish', () => {
      console.log(`Receipt generated: ${relPath}`);
      resolve(relPath);
    });
    writeStream.on('error', (err) => {
      console.error('Receipt generation failed:', err.message);
      reject(err);
    });
  });
};

module.exports = { generateReceipt };
