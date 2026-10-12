const { Schema } = require('mongoose');

// GeoJSON point. MongoDB stores coordinates as [longitude, latitude].
const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (c) => c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
        message: 'Location must be [longitude, latitude].',
      },
    },
  },
  { _id: false }
);

const REVIEW_STATUS = ['pending', 'approved', 'rejected'];

// Shared review fields for restaurants and charities (admin verification, FR1.1 and FR2.1).
const reviewFields = {
  status: { type: String, enum: REVIEW_STATUS, default: 'pending', index: true },
  rejectionReason: { type: String, trim: true, maxlength: 300 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
};

function cleanJSON(schema) {
  schema.set('toJSON', {
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  });
}

module.exports = { pointSchema, reviewFields, REVIEW_STATUS, cleanJSON };
