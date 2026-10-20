const PromoCode = require('../models/PromoCode');
exports.create = async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const type = req.body?.type;
    const value = Number(req.body?.value);
    const minimumSubtotalInCents = Number(req.body?.minimumSubtotalInCents || 0);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return res.status(400).json({ success: false, message: 'Code must be 3–40 letters, numbers, underscores or hyphens.' });
    if (!['percentage', 'fixed'].includes(type) || !Number.isInteger(value) || value < 1 || (type === 'percentage' && value > 100)) return res.status(400).json({ success: false, message: 'Use type percentage with value 1–100, or fixed with value in cents.' });
    if (!Number.isInteger(minimumSubtotalInCents) || minimumSubtotalInCents < 0) return res.status(400).json({ success: false, message: 'Minimum subtotal must be a non-negative integer in cents.' });
    const promo = await PromoCode.create({ code, type, value, minimumSubtotalInCents, expiresAt: req.body.expiresAt || null, startsAt: req.body.startsAt || null, maxRedemptions: req.body.maxRedemptions == null ? null : Number(req.body.maxRedemptions), active: req.body.active !== false, currency: String(req.body.currency || 'usd').toLowerCase() });
    res.status(201).json({ success: true, promo });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ success: false, message: 'That promo code already exists.' }); next(error); }
};
exports.list = async (req, res, next) => {
  try { const promos = await PromoCode.find().sort({ createdAt: -1 }).lean(); res.json({ success: true, promos }); } catch (error) { next(error); }
};
exports.update = async (req, res, next) => {
  try { const allowed = {}; if (typeof req.body?.active === 'boolean') allowed.active = req.body.active; if (req.body?.expiresAt !== undefined) allowed.expiresAt = req.body.expiresAt || null; if (req.body?.maxRedemptions !== undefined) allowed.maxRedemptions = req.body.maxRedemptions == null ? null : Number(req.body.maxRedemptions); const promo = await PromoCode.findByIdAndUpdate(req.params.id, { $set: allowed }, { new: true, runValidators: true }); if (!promo) return res.status(404).json({ success: false, message: 'Promo code not found.' }); res.json({ success: true, promo }); } catch (error) { next(error); }
};
