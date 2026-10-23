
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const COOKIE_NAME = "nn_admin_session";
const SESSION_TTL = "8h";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  return left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: 8 * 60 * 60 * 1000,
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;

    const key = part.slice(0, index).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return "";
      }
    }
  }

  return "";
}

exports.login = (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const adminEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!adminEmail || !adminPassword || !sessionSecret) {
    return res.status(503).json({
      message: "Admin authentication is not configured.",
    });
  }

  if (
    !safeEqual(email, adminEmail) ||
    !safeEqual(password, adminPassword)
  ) {
    return res.status(401).json({
      message: "Invalid email or password.",
    });
  }

  const token = jwt.sign(
    { sub: "nard-notes-admin", purpose: "admin-session" },
    sessionSecret,
    { expiresIn: SESSION_TTL, issuer: "nard-notes" }
  );

  res.cookie(COOKIE_NAME, token, cookieOptions());

  return res.json({
    success: true,
    admin: { email: adminEmail },
  });
};


exports.me = (req, res) => {
  const session = exports.verifySession(req);

  if (!session) {
    return res.status(401).json({
      authenticated: false,
      message: "A valid admin session is required.",
    });
  }

  return res.json({
    authenticated: true,
    admin: {
      email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
    },
  });
};


exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    ...cookieOptions(),
    maxAge: undefined,
  });

  return res.json({ success: true });
};

exports.verifySession = (req) => {
  const token = readCookie(req, COOKIE_NAME);
  if (!token || !process.env.ADMIN_SESSION_SECRET) return null;

  try {
    const payload = jwt.verify(
      token,
      process.env.ADMIN_SESSION_SECRET,
      { issuer: "nard-notes" }
    );

    if (
      payload.sub !== "nard-notes-admin" ||
      payload.purpose !== "admin-session"
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};
