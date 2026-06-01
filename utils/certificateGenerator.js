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
    doc.rect(0, 0, W, H).fill('#0A0A12');

    // ── Decorative border ───────────────────────────────────
    // Outer border
    doc.rect(20, 20, W - 40, H - 40)
       .lineWidth(3)
       .strokeColor('#d4ff00')
       .stroke();

    // Inner border
    doc.rect(28, 28, W - 56, H - 56)
       .lineWidth(1)
       .strokeColor('rgba(212,255,0,0.3)')
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
       .fontSize(11)
       .fillColor('#d4ff00')
       .text('⚡  SPORTS CLUB MANAGEMENT PLATFORM', 0, 65, {
         align:  'center',
         width:  W,
         characterSpacing: 2,
       });

    // ── Decorative line ─────────────────────────────────────
    doc.moveTo(W / 2 - 120, 88)
       .lineTo(W / 2 + 120, 88)
       .lineWidth(1)
       .strokeColor('#06b6d4')
       .stroke();

    // ── Certificate title ───────────────────────────────────
    doc.font('Helvetica-Bold')
       .fontSize(32)
       .fillColor(medalColor)
       .text(medalLabel.toUpperCase(), 0, 100, {
         align:            'center',
         width:            W,
         characterSpacing: 1,
       });

    // ── Divider ─────────────────────────────────────────────
    doc.moveTo(W / 2 - 200, 146)
       .lineTo(W / 2 + 200, 146)
       .lineWidth(1.5)
       .strokeColor(medalColor)
       .stroke();

    // ── "This is to certify" ─────────────────────────────────
    doc.font('Helvetica')
       .fontSize(12)
       .fillColor('rgba(197,201,172,0.7)')
       .text('This is to certify that', 0, 162, { align: 'center', width: W });

    // ── Student Name (hero) ─────────────────────────────────
    doc.font('Helvetica-Bold')
       .fontSize(40)
       .fillColor('#e2e4cf')
       .text(studentName || 'Athlete Name', 0, 182, { align: 'center', width: W });

    // ── Underline below name ─────────────────────────────────
    const nameWidth  = Math.min(doc.widthOfString(studentName || 'Athlete Name', { fontSize: 40 }) + 60, 400);
    const nameX      = (W - nameWidth) / 2;
    doc.moveTo(nameX, 234).lineTo(nameX + nameWidth, 234)
       .lineWidth(1).strokeColor('#d4ff00').stroke();

    // ── "has participated / achieved" ─────────────────────────
    const participationText = medalWon !== 'None'
      ? `has achieved ${resultText || '1st Place'} in`
      : 'has successfully participated in';

    doc.font('Helvetica')
       .fontSize(12)
       .fillColor('rgba(197,201,172,0.7)')
       .text(participationText, 0, 248, { align: 'center', width: W });

    // ── Competition Name ─────────────────────────────────────
    doc.font('Helvetica-Bold')
       .fontSize(20)
       .fillColor('#06b6d4')
       .text(competitionName || 'Competition Name', 0, 270, {
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
    ].filter(Boolean).join('     ');

    doc.font('Helvetica')
       .fontSize(10)
       .fillColor('rgba(197,201,172,0.6)')
       .text(details, 0, 308, { align: 'center', width: W });

    // ── Bottom accent bar ────────────────────────────────────
    doc.rect(40, H - 44, W - 80, 4).fill('#d4ff00');

    // ── Certificate ID & date ───────────────────────────────
    const generatedDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    doc.font('Helvetica')
       .fontSize(8)
       .fillColor('rgba(197,201,172,0.4)')
       .text(`Issued: ${generatedDate}     Certificate ID: ${certId}`, 0, H - 38, {
         align: 'center',
         width: W,
       });

    // ── Signature placeholders ──────────────────────────────
    // Left signature
    doc.moveTo(120, H - 80).lineTo(260, H - 80)
       .lineWidth(1).strokeColor('rgba(255,255,255,0.15)').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('rgba(197,201,172,0.5)')
       .text('Coach / Trainer Signature', 120, H - 72, { width: 140, align: 'center' });

    // Right signature
    doc.moveTo(W - 260, H - 80).lineTo(W - 120, H - 80)
       .lineWidth(1).strokeColor('rgba(255,255,255,0.15)').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('rgba(197,201,172,0.5)')
       .text('Club Administrator Signature', W - 260, H - 72, { width: 140, align: 'center' });

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
