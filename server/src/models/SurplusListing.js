const { Schema, model } = require('mongoose');
const { pointSchema, cleanJSON } = require('./common');

const CATEGORIES = ['Cooked', 'Bakery', 'Packaged'];
const DIET_TAGS = ['Veg', 'Non-veg', 'Halal', 'Contains nuts'];
const OFFER_TYPES = ['sale', 'donate'];
const LISTING_STATUS = ['active', 'reserved', 'collected', 'expired', 'withdrawn'];

// F1 – FR1.2: a short-lived surplus listing. `available` drops as packs are reserved or claimed (F2).
const listingSchema = new Schema(
  {
    restaurant: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    item: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, required: true },
    dietTags: { type: [{ type: String, enum: DIET_TAGS }], default: [] },
    quantity: { type: Number, required: true, min: 1, max: 500 },
    available: { type: Number, required: true, min: 0 },
    // Weight of one pack, used to report kg of food saved (FR1.5 hand-over, F1 report).
    // Default keeps listings created before this field valid.
    packWeightKg: { type: Number, min: 0.05, max: 25, default: 0.4 },
    originalPrice: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 }, // 0 for donations
    offerType: { type: String, enum: OFFER_TYPES, required: true },
    pickupFrom: { type: Date, required: true },
    pickupTo: { type: Date, required: true },
    safeUntil: { type: Date, required: true },
    hygieneDeclared: { type: Boolean, required: true },
    status: { type: String, enum: LISTING_STATUS, default: 'active' },
    // Copied from the restaurant so "near me" search (FR2.2) is a single geo query.
    location: { type: pointSchema, required: true },
  },
  { timestamps: true }
);

listingSchema.index({ location: '2dsphere' });
listingSchema.index({ status: 1, safeUntil: 1 });
listingSchema.index({ restaurant: 1, createdAt: -1 });
cleanJSON(listingSchema);

module.exports = model('SurplusListing', listingSchema);
Object.assign(module.exports, { CATEGORIES, DIET_TAGS, OFFER_TYPES, LISTING_STATUS });
