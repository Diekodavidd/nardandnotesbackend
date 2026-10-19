
const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { register, login, getMe } = require("../controllers/authController");

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  next();
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "nard-and-notes",
      audience: "nard-and-notes-customers",
    });

    req.user = { id: payload.sub };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Your session has expired. Please log in again.",
    });
  }
}

router.post(
  "/register",
  body("name").isString().trim().isLength({ min: 1, max: 100 }),
  body("email").isEmail().normalizeEmail(),
  body("password").isString().isLength({ min: 10, max: 72 }),
  validateRequest,
  register
);

router.post(
  "/login",
  body("email").isEmail().normalizeEmail(),
  body("password").isString().notEmpty(),
  validateRequest,
  login
);

router.get("/me", requireAuth, getMe);

module.exports = router;
