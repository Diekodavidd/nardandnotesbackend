const mongoose = require('mongoose');
const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  active: { type: Boolean, default: true },
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true, min: 1, max: 100000000 }, // percentage 1-100; fixed amount in cents
  currency: { type: String, default: 'usd', lowercase: true },
  minimumSubtotalInCents: { type: Number, default: 0, min: 0 },
  startsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  maxRedemptions: { type: Number, default: null, min: 1 },
  redemptionCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
promoCodeSchema.index({ code: 1, active: 1 });
module.exports = mongoose.model('PromoCode', promoCodeSchema);
