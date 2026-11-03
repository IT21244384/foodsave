const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ user: req.user.id, readAt: null }),
  ]);
  res.json({ items, unread });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user.id, readAt: null }, { readAt: new Date() });
  res.json({ unread: 0 });
}));

module.exports = router;
