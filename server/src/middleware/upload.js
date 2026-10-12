const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { HttpError } = require('./errors');

const ALLOWED = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

// Charity registration certificates (FR2.1): PDF/JPG/PNG up to 5 MB, saved under a random name.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + ALLOWED[file.mimetype]),
});

const charityDocument = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okExt = ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext);
    if (ALLOWED[file.mimetype] && okExt) return cb(null, true);
    cb(new HttpError(400, 'Upload the registration certificate as a PDF, JPG or PNG.', { document: 'Upload a PDF, JPG or PNG file.' }));
  },
}).single('document');

function removeUploaded(file) {
  if (file && file.path) fs.promises.unlink(file.path).catch(() => {});
}

module.exports = { charityDocument, removeUploaded };
