const { validatePromo } = require('../services/promoService');
exports.validate = async (req, res, next) => {
  try {
    const subtotalInCents = Number(req.body?.subtotalInCents);
    if (!Number.isInteger(subtotalInCents) || subtotalInCents < 0) return res.status(400).json({ success: false, message: 'A valid subtotal is required in cents.' });
    const result = await validatePromo(req.body?.code, subtotalInCents);
    if (!result.valid) return res.status(422).json({ success: false, message: result.message });
    return res.json({ success: true, code: result.code, discountInCents: result.discountInCents, subtotalAfterDiscountInCents: subtotalInCents - result.discountInCents });
  } catch (error) { next(error); }
};
