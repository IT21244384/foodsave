const { Schema, model } = require('mongoose');
const { cleanJSON } = require('./common');

// In-app messages, e.g. FR1.4: a reservation was closed because the food expired.
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 400 },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
cleanJSON(notificationSchema);
module.exports = model('Notification', notificationSchema);
