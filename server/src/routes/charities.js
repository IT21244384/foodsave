const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Charity = require('../models/Charity');
const { toFieldErrors } = require('../middleware/validate');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const { charityDocument, removeUploaded } = require('../middleware/upload');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');
const { toPoint } = require('./auth');

// F2 – FR2.1: charity registration with a registration certificate (owned by Abisheak S).
const router = express.Router();

router.post('/register', charityDocument, asyncHandler(async (req, res) => {
  const parsed = schemas.charityRegister.safeParse(req.body);
  const fields = parsed.success ? {} : toFieldErrors(parsed.error.issues);
  if (!req.file) fields.document = 'Upload your registration certificate (PDF, JPG or PNG).';
  if (Object.keys(fields).length) {
    removeUploaded(req.file);
    throw new HttpError(400, 'Please check the highlighted fields.', fields);
  }
  const d = parsed.data;
  try {
    if (await User.exists({ email: d.email })) throw new HttpError(409, 'An account with this email already exists.', { email: 'An account with this email already exists.' });
    if (await Charity.exists({ regNo: d.regNo.toUpperCase() })) throw new HttpError(409, 'A charity with this registration number is already registered.', { regNo: 'Already registered.' });
    const user = await User.create({ name: d.name, email: d.email, phone: d.phone, role: 'charity', passwordHash: await bcrypt.hash(d.password, 10) });
    let profile;
    try {
      profile = await Charity.create({
        owner: user._id, name: d.orgName, regNo: d.regNo, address: d.address, area: d.area, contactPerson: d.contactPerson, phone: d.phone,
        location: toPoint(d.lat, d.lng),
        document: { originalName: req.file.originalname.slice(0, 120), storedName: req.file.filename, mimeType: req.file.mimetype, size: req.file.size },
      });
    } catch (err) {
      await User.deleteOne({ _id: user._id });
      throw err;
    }
    res.status(201).json({ token: signToken(user), user, profile });
  } catch (err) {
    removeUploaded(req.file);
    throw err;
  }
}));

router.get('/me', requireAuth, requireRole('charity'), asyncHandler(async (req, res) => {
  const profile = await Charity.findOne({ owner: req.user.id });
  if (!profile) throw new HttpError(404, 'Charity profile not found.');
  res.json(profile);
}));

module.exports = router;
