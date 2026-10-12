const { Schema, model } = require('mongoose');
const { cleanJSON } = require('./common');

// F2 – FR2.3 (sprint 2): a customer's reservation of discounted packs.
const reservationSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'SurplusListing', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quantity: { type: Number, required: true, min: 1, max: 2 },
    pickupCode: { type: String, required: true, unique: true },
    status: { type: String, enum: ['reserved', 'collected', 'cancelled', 'no-show'], default: 'reserved' },
    collectedAt: Date,
  },
  { timestamps: true }
);

cleanJSON(reservationSchema);
module.exports = model('Reservation', reservationSchema);
