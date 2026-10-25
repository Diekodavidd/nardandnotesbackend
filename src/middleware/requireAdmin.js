
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

module.exports = async function requireAdmin(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required.",
      });
    }

    let payload;

    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Your admin token is invalid or expired.",
      });
    }

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin token.",
      });
    }

    const admin = await Admin.findById(payload.sub);

    if (!admin || !admin.isActive || admin.role !== "superadmin") {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required.",
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};
