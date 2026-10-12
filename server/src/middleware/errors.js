const multer = require('multer');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function notFound(_req, res) {
  res.status(404).json({ error: 'Not found.' });
}

// Last middleware: turns known errors into clear messages and never leaks stack traces.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.fields && { fields: err.fields }) });
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'The document must be 5 MB or smaller.' : 'The upload could not be processed.';
    return res.status(400).json({ error: msg, fields: { document: msg } });
  }
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || { value: 1 })[0];
    const labels = { email: 'An account with this email already exists.', regNo: 'A charity with this registration number is already registered.', owner: 'This account already has a profile.' };
    return res.status(409).json({ error: labels[field] || 'This record already exists.', fields: { [field]: labels[field] || 'Already exists.' } });
  }
  if (err && err.name === 'ValidationError') {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return res.status(400).json({ error: 'Please check the highlighted fields.', fields });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (process.env.NODE_ENV !== 'test') console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = { asyncHandler, HttpError, notFound, errorHandler };
