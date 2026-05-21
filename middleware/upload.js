// ─────────────────────────────────────────────────────────────
// middleware/upload.js  –  Multer + Sharp file upload handler
// Handles photo, birth_certificate, and id_proof uploads.
// Images (jpg/png) are compressed with Sharp to ≤ 1 MB.
// PDFs are accepted up to 2 MB with no compression.
// ─────────────────────────────────────────────────────────────
const multer  = require('multer');
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');

// ── Directory paths ──────────────────────────────────────────
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const DIRS = {
  photo:             path.join(UPLOADS_ROOT, 'photos'),
  birth_certificate: path.join(UPLOADS_ROOT, 'birth_certificates'),
  id_proof:          path.join(UPLOADS_ROOT, 'id_proofs'),
};

// Ensure directories exist
Object.values(DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Allowed MIME types ───────────────────────────────────────
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

// ── Multer storage: save to memory first, then Sharp processes ─
const storage = multer.memoryStorage();

// ── File filter ──────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and PDF files are allowed.'), false);
  }
};

// ── Multer instance ──────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB raw limit (we enforce tighter limits below)
});

// ── Helper: process and save uploaded file ───────────────────
/**
 * Processes one uploaded file:
 *  - Images (jpg/png) → compressed by Sharp ≤ 1 MB
 *  - PDFs             → size validated ≤ 2 MB, saved as-is
 * Returns the relative path (from uploads root) stored in DB.
 */
const processFile = async (file, fieldname) => {
  const timestamp = Date.now();
  const sanitizedOriginal = file.originalname.replace(/\s+/g, '_');

  if (file.mimetype === 'application/pdf') {
    // PDF size check: 2 MB max
    if (file.buffer.length > 2 * 1024 * 1024) {
      throw new Error(`${fieldname} PDF must be under 2 MB.`);
    }
    const filename = `${timestamp}_${sanitizedOriginal}`;
    const destDir  = DIRS[fieldname] || path.join(UPLOADS_ROOT, fieldname);
    const destPath = path.join(destDir, filename);
    fs.writeFileSync(destPath, file.buffer);
    // Return relative URL path for DB storage
    return `uploads/${path.basename(destDir)}/${filename}`;
  } else {
    // Image: compress with Sharp to JPEG ≤ 1 MB (quality step-down)
    const filename = `${timestamp}_compressed.jpg`;
    const destDir  = DIRS[fieldname] || path.join(UPLOADS_ROOT, fieldname);
    const destPath = path.join(destDir, filename);

    let quality = 80;
    let outputBuffer;
    do {
      outputBuffer = await sharp(file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      quality -= 10;
    } while (outputBuffer.length > 1 * 1024 * 1024 && quality > 10);

    fs.writeFileSync(destPath, outputBuffer);
    return `uploads/${path.basename(destDir)}/${filename}`;
  }
};

module.exports = { upload, processFile };
