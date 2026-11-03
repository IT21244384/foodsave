const { Schema, model } = require('mongoose');
const { cleanJSON } = require('./common');

// F2 – FR2.3: a customer's reservation of discounted packs.
const reservationSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'SurplusListing', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quantity: { type: Number, required: true, min: 1, max: 2 },
    pickupCode: { type: String, required: true },
    status: { type: String, enum: ['reserved', 'collected', 'cancelled', 'no-show'], default: 'reserved' },
    closedReason: { type: String, maxlength: 200 }, // why FoodSave or the restaurant closed it
    collectedAt: Date,
  },
  { timestamps: true }
);

// Codes only need to be unique while they can still be used; closed codes are recycled.
reservationSchema.index({ pickupCode: 1 }, { unique: true, partialFilterExpression: { status: 'reserved' } });
reservationSchema.index({ status: 1, collectedAt: 1 });
cleanJSON(reservationSchema);
module.exports = model('Reservation', reservationSchema);
