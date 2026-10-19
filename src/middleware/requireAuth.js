const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Please sign in to continue.' });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'nard-and-notes',
      audience: 'nard-and-notes-customers',
    });
    const user = await User.findById(payload.sub).select('_id name email addresses wishlist createdAt');
    if (!user) return res.status(401).json({ success: false, message: 'Your session is no longer valid.' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Please sign in again.' });
  }
};
