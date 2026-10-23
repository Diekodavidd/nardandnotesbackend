
const crypto = require("crypto");
const { verifySession } = require("../controllers/adminAuthController");

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  return left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

module.exports = function requireAdmin(req, res, next) {
  // Browser dashboard authentication.
  if (verifySession(req)) {
    return next();
  }

  // Preserve existing API-key authentication.
  const expected = process.env.ADMIN_API_KEY;
  const supplied = req.headers["x-admin-api-key"];

  if (
    expected &&
    typeof supplied === "string" &&
    safeEqual(supplied, expected)
  ) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "Admin authentication required.",
  });
};
