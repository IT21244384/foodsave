const { Schema, model } = require('mongoose');
const { pointSchema, reviewFields, cleanJSON } = require('./common');

// F1 – FR1.1: a restaurant profile, verified by an administrator before it can post listings.
const restaurantSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    area: { type: String, required: true, trim: true, maxlength: 60 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    businessRegNo: { type: String, required: true, trim: true, maxlength: 40 },
    location: { type: pointSchema, required: true },
    ...reviewFields,
  },
  { timestamps: true }
);

restaurantSchema.index({ location: '2dsphere' });
cleanJSON(restaurantSchema);

module.exports = model('Restaurant', restaurantSchema);
