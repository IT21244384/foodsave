const { Schema, model } = require('mongoose');
const { cleanJSON } = require('./common');

// F2 – FR2.4 (sprint 2): a verified charity's claim on a donation listing.
const claimSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'SurplusListing', required: true, index: true },
    charity: { type: Schema.Types.ObjectId, ref: 'Charity', required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    pickupCode: { type: String, required: true, unique: true },
    status: { type: String, enum: ['claimed', 'collected', 'cancelled', 'no-show'], default: 'claimed' },
    collectedAt: Date,
  },
  { timestamps: true }
);

cleanJSON(claimSchema);
module.exports = model('DonationClaim', claimSchema);
