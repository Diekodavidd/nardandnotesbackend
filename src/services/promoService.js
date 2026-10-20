const PromoCode = require('../models/PromoCode');

async function validatePromo(code, subtotalInCents) {
  const normalised = String(code || '').trim().toUpperCase();
  if (!normalised) return { valid: false, message: 'Enter a promo code.' };
  const promo = await PromoCode.findOne({ code: normalised, active: true });
  const now = new Date();
  if (!promo || (promo.startsAt && promo.startsAt > now) || (promo.expiresAt && promo.expiresAt < now)) {
    return { valid: false, message: 'This promo code is invalid or expired.' };
  }
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
    return { valid: false, message: 'This promo code has reached its redemption limit.' };
  }
  if (subtotalInCents < promo.minimumSubtotalInCents) {
    return { valid: false, message: `This code requires a minimum subtotal of ${(promo.minimumSubtotalInCents / 100).toFixed(2)} ${promo.currency.toUpperCase()}.` };
  }
  const discountInCents = Math.min(subtotalInCents, promo.type === 'percentage'
    ? Math.floor(subtotalInCents * Math.min(100, promo.value) / 100)
    : promo.value);
  return { valid: true, promo, code: promo.code, discountInCents };
}
module.exports = { validatePromo };
