
const PromoCode = require("../models/PromoCode");

async function validatePromo(code, subtotalInCents, currency = "usd") {
  const normalised = String(code || "").trim().toUpperCase();
  const normalisedCurrency = String(currency || "usd").trim().toLowerCase();

  if (!normalised) {
    return { valid: false, message: "Enter a promo code." };
  }

  if (!Number.isSafeInteger(subtotalInCents) || subtotalInCents < 0) {
    return { valid: false, message: "A valid subtotal is required." };
  }

  const promo = await PromoCode.findOne({
    code: normalised,
    active: true,
  });

  const now = new Date();

  if (
    !promo ||
    (promo.startsAt && promo.startsAt > now) ||
    (promo.expiresAt && promo.expiresAt <= now)
  ) {
    return {
      valid: false,
      message: "This promo code is invalid or expired.",
    };
  }

  if (String(promo.currency || "usd").toLowerCase() !== normalisedCurrency) {
    return {
      valid: false,
      message: `This code is not valid for ${normalisedCurrency.toUpperCase()} orders.`,
    };
  }

  if (
    promo.maxRedemptions != null &&
    promo.redemptionCount >= promo.maxRedemptions
  ) {
    return {
      valid: false,
      message: "This promo code has reached its redemption limit.",
    };
  }

  if (subtotalInCents < promo.minimumSubtotalInCents) {
    return {
      valid: false,
      message: `This code requires a minimum subtotal of ${(promo.minimumSubtotalInCents / 100).toFixed(2)} ${normalisedCurrency.toUpperCase()}.`,
    };
  }

  const discountInCents = Math.min(
    subtotalInCents,
    promo.type === "percentage"
      ? Math.floor((subtotalInCents * promo.value) / 100)
      : promo.value
  );

  return {
    valid: true,
    promo,
    code: promo.code,
    discountInCents,
    currency: normalisedCurrency,
  };
}

module.exports = { validatePromo };
