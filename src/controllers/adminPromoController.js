
const mongoose = require("mongoose");
const PromoCode = require("../models/PromoCode");
const { validatePromo } = require("../services/promoService");

const CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

function parseDate(value, fieldName) {
  if (value === null || value === "") return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

function validatePromoFields(body, { creating = false } = {}) {
  const errors = [];

  if (creating || body.code !== undefined) {
    const code = String(body.code || "").trim().toUpperCase();

    if (!CODE_PATTERN.test(code)) {
      errors.push(
        "Code must be 3–40 letters, numbers, underscores or hyphens."
      );
    }
  }

  if (creating || body.type !== undefined) {
    if (!["percentage", "fixed"].includes(body.type)) {
      errors.push("Type must be percentage or fixed.");
    }
  }

  if (creating || body.value !== undefined) {
    const value = Number(body.value);
    const type = body.type;

    if (
      !Number.isInteger(value) ||
      value < 1 ||
      value > 100000000 ||
      (type === "percentage" && value > 100)
    ) {
      errors.push(
        "Percentage discounts must be 1–100. Fixed discounts must be a positive integer in cents."
      );
    }
  }

  if (body.minimumSubtotalInCents !== undefined || creating) {
    const minimum = Number(body.minimumSubtotalInCents ?? 0);

    if (!Number.isSafeInteger(minimum) || minimum < 0) {
      errors.push("Minimum subtotal must be a non-negative integer in cents.");
    }
  }

  if (body.currency !== undefined || creating) {
    const currency = String(body.currency || "usd").trim();

    if (!/^[a-zA-Z]{3}$/.test(currency)) {
      errors.push("Currency must be a valid three-letter currency code.");
    }
  }

  if (body.maxRedemptions !== undefined || creating) {
    const limit = body.maxRedemptions;

    if (
      limit !== null &&
      limit !== "" &&
      (!Number.isSafeInteger(Number(limit)) || Number(limit) < 1)
    ) {
      errors.push("Maximum redemptions must be a positive whole number or unlimited.");
    }
  }

  if (body.active !== undefined && typeof body.active !== "boolean") {
    errors.push("Active must be true or false.");
  }

  return errors;
}

function buildPromoPayload(body, { creating = false } = {}) {
  const payload = {};

  if (creating || body.code !== undefined) {
    payload.code = String(body.code).trim().toUpperCase();
  }

  if (creating || body.type !== undefined) {
    payload.type = body.type;
  }

  if (creating || body.value !== undefined) {
    payload.value = Number(body.value);
  }

  if (creating || body.currency !== undefined) {
    payload.currency = String(body.currency || "usd").trim().toLowerCase();
  }

  if (creating || body.minimumSubtotalInCents !== undefined) {
    payload.minimumSubtotalInCents = Number(
      body.minimumSubtotalInCents ?? 0
    );
  }

  if (creating || body.startsAt !== undefined) {
    payload.startsAt = parseDate(body.startsAt, "Start date");
  }

  if (creating || body.expiresAt !== undefined) {
    payload.expiresAt = parseDate(body.expiresAt, "Expiry date");
  }

  if (creating || body.maxRedemptions !== undefined) {
    payload.maxRedemptions =
      body.maxRedemptions == null || body.maxRedemptions === ""
        ? null
        : Number(body.maxRedemptions);
  }

  if (creating || body.active !== undefined) {
    payload.active = body.active === undefined ? true : body.active;
  }

  const startsAt = payload.startsAt;
  const expiresAt = payload.expiresAt;

  if (
    startsAt &&
    expiresAt &&
    expiresAt <= startsAt
  ) {
    throw new Error("Expiry date must be later than the start date.");
  }

  return payload;
}

// CREATE PROMO
exports.create = async (req, res, next) => {
  try {
    const errors = validatePromoFields(req.body, { creating: true });

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    const payload = buildPromoPayload(req.body, { creating: true });
    const promo = await PromoCode.create(payload);

    return res.status(201).json({
      success: true,
      promo,
      message: "Promotion created successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That promo code already exists.",
      });
    }

    if (
      error.message?.includes("must be a valid date") ||
      error.message?.includes("Expiry date")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
};

// LIST PROMOS
exports.list = async (req, res, next) => {
  try {
    const promos = await PromoCode.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      promos,
    });
  } catch (error) {
    return next(error);
  }
};

// UPDATE PROMO
exports.update = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid promo code ID.",
      });
    }

    const existing = await PromoCode.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Promo code not found.",
      });
    }

    const body = req.body || {};

    if (!Object.keys(body).length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update.",
      });
    }

    const errors = validatePromoFields(body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    // Build a patch from only supported, explicitly supplied fields.
    const payload = buildPromoPayload(body);

    // Validate the combined date range, including unchanged dates.
    const nextStartsAt =
      payload.startsAt !== undefined
        ? payload.startsAt
        : existing.startsAt;

    const nextExpiresAt =
      payload.expiresAt !== undefined
        ? payload.expiresAt
        : existing.expiresAt;

    if (
      nextStartsAt &&
      nextExpiresAt &&
      nextExpiresAt <= nextStartsAt
    ) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be later than the start date.",
      });
    }

    // If only one of type/value changes, validate the combination
    // against the existing document as well.
    const nextType = payload.type ?? existing.type;
    const nextValue = payload.value ?? existing.value;

    if (
      !["percentage", "fixed"].includes(nextType) ||
      !Number.isInteger(nextValue) ||
      nextValue < 1 ||
      nextValue > 100000000 ||
      (nextType === "percentage" && nextValue > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "The resulting discount type and value are invalid.",
      });
    }

    // Do not allow a limit below the number already redeemed.
    const nextLimit =
      payload.maxRedemptions !== undefined
        ? payload.maxRedemptions
        : existing.maxRedemptions;

    if (
      nextLimit !== null &&
      nextLimit !== undefined &&
      nextLimit < existing.redemptionCount
    ) {
      return res.status(400).json({
        success: false,
        message: "Maximum redemptions cannot be lower than the current redemption count.",
      });
    }

    Object.assign(existing, payload);
    await existing.save();

    return res.json({
      success: true,
      promo: existing,
      message: "Promotion updated successfully.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That promo code already exists.",
      });
    }

    if (
      error.message?.includes("must be a valid date") ||
      error.message?.includes("Expiry date")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
};

