const { Schema, model } = require('mongoose');
const { cleanJSON } = require('./common');

const ROLES = ['customer', 'restaurant', 'charity', 'admin'];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never returned by queries unless explicitly selected.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    phone: { type: String, trim: true, maxlength: 20 },
  },
  { timestamps: true }
);

cleanJSON(userSchema);
const baseTransform = userSchema.get('toJSON').transform;
userSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    baseTransform(doc, ret);
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = model('User', userSchema);
module.exports.ROLES = ROLES;
