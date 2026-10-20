// Protect operational endpoints with a separate server-side secret.
// Configure ADMIN_API_KEY in the hosting provider; never expose it to the browser.
const crypto = require('node:crypto');
module.exports = function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  const supplied = req.get('x-admin-api-key') || '';
  if (!expected || !supplied) {
    return res.status(503).json({ success: false, message: 'Admin API is not configured.' });
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: 'Not authorised.' });
  }
  next();
};
