
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

function createToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }

  return jwt.sign(
    { sub: user._id.toString() },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      issuer: "nard-and-notes",
      audience: "nard-and-notes-customers",
    }
  );
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

async function register(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Enter your name (up to 100 characters).",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (typeof password !== "string" || password.length < 10 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "Your password must be between 10 and 72 characters.",
      });
    }

    const existing = await User.findOne({ email }).select("_id");

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists. Please log in.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists. Please log in.",
      });
    }

    console.error("Registration error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create your account right now.",
    });
  }
}

async function login(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!email || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Enter your email and password.",
      });
    }

    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logged in successfully.",
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to log in right now.",
    });
  }
}

async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id).select("name email");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Your account could not be found. Please log in again.",
      });
    }

    return res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("Get account error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your account.",
    });
  }
}

module.exports = { register, login, getMe };
