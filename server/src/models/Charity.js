const { Schema, model } = require('mongoose');
const { pointSchema, reviewFields, cleanJSON } = require('./common');

// F2 – FR2.1: a charity account. Only approved charities may claim donation listings.
const charitySchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    regNo: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 40 },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    area: { type: String, required: true, trim: true, maxlength: 60 },
    contactPerson: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    location: { type: pointSchema, required: true },
    // Registration certificate. Stored on disk under a random name; only admins can download it.
    document: {
      originalName: { type: String, required: true },
      storedName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
    },
    dailyClaimLimit: { type: Number, default: 20, min: 1 },
    ...reviewFields,
  },
  { timestamps: true }
);

charitySchema.index({ location: '2dsphere' });
cleanJSON(charitySchema);
const base = charitySchema.get('toJSON').transform;
charitySchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    base(doc, ret);
    if (ret.document) delete ret.document.storedName;
    return ret;
  },
});

module.exports = model('Charity', charitySchema);
