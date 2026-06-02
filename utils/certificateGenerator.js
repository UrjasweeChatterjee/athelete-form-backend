// ─────────────────────────────────────────────────────────────
// utils/certificateGenerator.js  –  PDF Certificate Generator
//
// Uses PDFKit (lightweight, no headless browser needed).
// Generates a clean, professional certificate PDF.
// Saves file to: uploads/certificates/
// Returns relative path for DB storage.
// ─────────────────────────────────────────────────────────────

const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

// Ensure certificates folder exists
const CERT_DIR = path.join(__dirname, '..', 'uploads', 'certificates');
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

/**
 * Generate a PDF certificate for a student's competition result.
 *
 * @param {object} data
 * @param {number} data.resultId            - competition_results.id (used in filename)
 * @param {string} data.studentName         - athlete full name
 * @param {string} data.competitionName     - competition name
 * @param {string} data.competitionDate     - formatted date string
 * @param {string} data.categoryLevel       - category / level (e.g. District, State)
 * @param {string} data.ageGroup            - age group
 * @param {string} data.medalWon            - Gold | Silver | Bronze | None
 * @param {string} data.resultText          - e.g. '1st Place', 'Participant'
 * @param {string} [data.eventName]         - specific event name
 *
 * @returns {string} relative file path — e.g. uploads/certificates/cert_42_1717000000.pdf
 */
const generateCertificate = (data) => {
  return new Promise((resolve, reject) => {
    const {
      resultId,
      studentName,
      competitionName,
      competitionDate,
      categoryLevel,
      ageGroup,
      medalWon,
      resultText,
      eventName,
    } = data;

    const timestamp = Date.now();
    const filename  = `cert_${resultId}_${timestamp}.pdf`;
    const filePath  = path.join(CERT_DIR, filename);
    const relPath   = `uploads/certificates/${filename}`;

    // Certificate ID for tracking
    const certId = `SCM-CERT-${String(resultId).padStart(6, '0')}-${timestamp.toString().slice(-6)}`;

    // Medal colour map
    const medalColors = {
      Gold:   '#D4AF37',
      Silver: '#A8A9AD',
      Bronze: '#CD7F32',
      None:   '#6366f1',
    };
    const medalColor = medalColors[medalWon] || '#6366f1';
    const medalLabel = medalWon === 'None' ? 'Certificate of Participation' : `${medalWon} Medal`;

    // Create PDF in landscape A4
    const doc = new PDFDocument({
      size:   'A4',
      layout: 'landscape',
      margin: 0,
    });

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const W = 841.89; // A4 landscape width  (points)
    const H = 595.28; // A4 landscape height (points)

    // ── Background ──────────────────────────────────────────
    doc.rect(0, 0, W, H).fill('#08080F');

    // ── Background Watermark Texture ───────────────────────
    // Subtle background grid
    doc.lineWidth(0.5);
    doc.strokeColor('rgba(212,255,0,0.015)');
    for (let x = 0; x < W; x += 40) {
      doc.moveTo(x, 0).lineTo(x, H).stroke();
    }
    for (let y = 0; y < H; y += 40) {
      doc.moveTo(0, y).lineTo(W, y).stroke();
    }

    // Concentric watermark circles in center
    doc.strokeColor('rgba(6,182,212,0.03)');
    for (let r = 50; r <= 320; r += 45) {
      doc.circle(W / 2, H / 2, r).stroke();
    }

    // ── Decorative border ───────────────────────────────────
    // Outer border (brand neon lime)
    doc.rect(20, 20, W - 40, H - 40)
       .lineWidth(3.5)
       .strokeColor('#d4ff00')
       .stroke();

    // Inner border
    doc.rect(27, 27, W - 54, H - 54)
       .lineWidth(1)
       .strokeColor('rgba(6,182,212,0.3)')
       .stroke();

    // ── Top accent bar ──────────────────────────────────────
    doc.rect(40, 40, W - 80, 4).fill('#d4ff00');

    // ── Corner ornaments ────────────────────────────────────
    const corners = [[40, 44], [W - 40, 44], [40, H - 44], [W - 40, H - 44]];
    corners.forEach(([cx, cy]) => {
      doc.circle(cx, cy, 6).fill('#d4ff00');
    });

    // ── Header: Club name ───────────────────────────────────
    doc.font('Helvetica-Bold')
       .fontSize(10)
       .fillColor('#d4ff00')
       .text('⚡  SPORTS CLUB MANAGEMENT PLATFORM  ⚡', 0, 65, {
         align:  'center',
         width:  W,
         characterSpacing: 2,
       });

    // ── Decorative line ─────────────────────────────────────
    doc.moveTo(W / 2 - 140, 88)
       .lineTo(W / 2 + 140, 88)
       .lineWidth(1)
       .strokeColor('#06b6d4')
       .stroke();

    // ── Certificate title ───────────────────────────────────
    doc.font('Helvetica-Bold')
       .fontSize(30)
       .fillColor(medalColor)
       .text(medalLabel.toUpperCase(), 0, 102, {
         align:            'center',
         width:            W,
         characterSpacing: 1.5,
       });

    // ── Divider ─────────────────────────────────────────────
    doc.moveTo(W / 2 - 180, 146)
       .lineTo(W / 2 + 180, 146)
       .lineWidth(1.5)
       .strokeColor(medalColor)
       .stroke();

    // ── "This is to certify" ─────────────────────────────────
    doc.font('Times-Italic')
       .fontSize(14)
       .fillColor('rgba(197,201,172,0.75)')
       .text('This is proudly presented to certify that', 0, 162, { align: 'center', width: W });

    // ── Student Name (hero) ─────────────────────────────────
    doc.font('Times-Bold')
       .fontSize(38)
       .fillColor('#e2e4cf')
       .text(studentName || 'Athlete Name', 0, 185, { align: 'center', width: W });

    // ── Underline below name ─────────────────────────────────
    const nameWidth  = Math.min(doc.widthOfString(studentName || 'Athlete Name', { fontSize: 38 }) + 60, 420);
    const nameX      = (W - nameWidth) / 2;
    doc.moveTo(nameX, 234).lineTo(nameX + nameWidth, 234)
       .lineWidth(1.2).strokeColor('#d4ff00').stroke();

    // ── "has participated / achieved" ─────────────────────────
    const participationText = medalWon !== 'None'
      ? `has achieved ${resultText || '1st Place'} in`
      : 'has successfully participated in';

    doc.font('Times-Italic')
       .fontSize(14)
       .fillColor('rgba(197,201,172,0.75)')
       .text(participationText, 0, 248, { align: 'center', width: W });

    // ── Competition Name ─────────────────────────────────────
    doc.font('Helvetica-Bold')
       .fontSize(22)
       .fillColor('#06b6d4')
       .text(competitionName || 'Competition Name', 0, 272, {
         align:            'center',
         width:            W,
         characterSpacing: 0.5,
       });

    // ── Details row ──────────────────────────────────────────
    const details = [
      competitionDate  ? `📅  ${competitionDate}` : null,
      categoryLevel    ? `🏷️  ${categoryLevel}` : null,
      ageGroup         ? `👤  Age Group: ${ageGroup}` : null,
      eventName        ? `🎯  ${eventName}` : null,
    ].filter(Boolean).join('      ');

    doc.font('Helvetica')
       .fontSize(10.5)
       .fillColor('rgba(197,201,172,0.65)')
       .text(details, 0, 312, { align: 'center', width: W });

    // ── Bottom accent bar ────────────────────────────────────
    doc.rect(40, H - 44, W - 80, 4).fill('#d4ff00');

    // ── Certificate ID & date ───────────────────────────────
    const generatedDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    doc.font('Helvetica')
       .fontSize(8.5)
       .fillColor('rgba(197,201,172,0.45)')
       .text(`Issued: ${generatedDate}     Certificate ID: ${certId}`, 0, H - 38, {
         align: 'center',
         width: W,
       });

    // ── Digital Seal / Emblem (Center Bottom) ────────────────
    const sealX = W / 2;
    const sealY = H - 110;

    // Outer ribbons
    doc.moveTo(sealX - 10, sealY + 20).lineTo(sealX - 25, sealY + 55).lineTo(sealX - 10, sealY + 48).lineTo(sealX + 5, sealY + 55).lineTo(sealX - 5, sealY + 20)
       .fill('rgba(212,255,0,0.25)');
    doc.moveTo(sealX + 10, sealY + 20).lineTo(sealX + 25, sealY + 55).lineTo(sealX + 10, sealY + 48).lineTo(sealX - 5, sealY + 55).lineTo(sealX + 5, sealY + 20)
       .fill('rgba(212,255,0,0.25)');

    // Seal rings
    doc.circle(sealX, sealY, 32).lineWidth(1.2).strokeColor('#d4ff00').stroke();
    doc.circle(sealX, sealY, 28).lineWidth(0.8).strokeColor('rgba(6,182,212,0.5)').stroke();
    doc.circle(sealX, sealY, 25).fill('#08080F');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#d4ff00').text('OFFICIAL', sealX - 25, sealY - 10, { width: 50, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#06b6d4').text('SEAL', sealX - 25, sealY + 1, { width: 50, align: 'center' });

    // ── Signature placeholders & Cursive Pen Scripts ─────────
    // Left signature: Coach
    const leftSigX = 120;
    const leftSigY = H - 90;
    
    // Coach Cursive Script
    doc.font('Times-BoldItalic').fontSize(16).fillColor('#06b6d4')
       .text('Marcus Thorne', leftSigX, leftSigY - 14, { width: 140, align: 'center' });
    // Blue ink pen scribble
    doc.moveTo(leftSigX + 10, leftSigY - 4)
       .bezierCurveTo(leftSigX + 40, leftSigY - 18, leftSigX + 90, leftSigY + 8, leftSigX + 130, leftSigY - 6)
       .lineWidth(1).strokeColor('rgba(6,182,212,0.5)').stroke();
    
    doc.moveTo(leftSigX, leftSigY).lineTo(leftSigX + 140, leftSigY)
       .lineWidth(1).strokeColor('rgba(255,255,255,0.15)').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('rgba(197,201,172,0.5)')
       .text('Coach / Trainer Signature', leftSigX, leftSigY + 8, { width: 140, align: 'center' });

    // Right signature: Director
    const rightSigX = W - 260;
    const rightSigY = H - 90;
    
    // Director Cursive Script
    doc.font('Times-BoldItalic').fontSize(16).fillColor('#06b6d4')
       .text('Aria Vance', rightSigX, rightSigY - 14, { width: 140, align: 'center' });
    // Blue ink pen scribble
    doc.moveTo(rightSigX + 10, rightSigY - 4)
       .bezierCurveTo(rightSigX + 35, rightSigY - 14, rightSigX + 85, rightSigY + 6, rightSigX + 130, rightSigY - 6)
       .lineWidth(1).strokeColor('rgba(6,182,212,0.5)').stroke();

    doc.moveTo(rightSigX, rightSigY).lineTo(rightSigX + 140, rightSigY)
       .lineWidth(1).strokeColor('rgba(255,255,255,0.15)').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('rgba(197,201,172,0.5)')
       .text('Club Administrator Signature', rightSigX, rightSigY + 8, { width: 140, align: 'center' });

    // ── Finish ───────────────────────────────────────────────
    doc.end();

    writeStream.on('finish', () => {
      console.log(`📜  Certificate generated: ${relPath}`);
      resolve(relPath);
    });
    writeStream.on('error', (err) => {
      console.error('❌  Certificate generation failed:', err.message);
      reject(err);
    });
  });
};

module.exports = { generateCertificate };
