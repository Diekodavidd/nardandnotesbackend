require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

async function seedAdmin() {
  const {
    MONGODB_URI,
    INITIAL_ADMIN_NAME,
    INITIAL_ADMIN_EMAIL,
    INITIAL_ADMIN_PASSWORD,
  } = process.env;

  if (
    !MONGODB_URI ||
    !INITIAL_ADMIN_NAME ||
    !INITIAL_ADMIN_EMAIL ||
    !INITIAL_ADMIN_PASSWORD
  ) {
    throw new Error(
      "Set MONGODB_URI, INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD."
    );
  }

  if (INITIAL_ADMIN_PASSWORD.length < 12) {
    throw new Error(
      "Use an initial admin password of at least 12 characters."
    );
  }

  await mongoose.connect(MONGODB_URI);

  try {
    const email = INITIAL_ADMIN_EMAIL.trim().toLowerCase();

    const existing = await Admin.findOne({ email });

    if (existing) {
      console.log(
        "An admin with this email already exists. No changes made."
      );
      return;
    }

    const passwordHash = await bcrypt.hash(
      INITIAL_ADMIN_PASSWORD,
      12
    );

    await Admin.create({
      name: INITIAL_ADMIN_NAME.trim(),
      email,
      passwordHash,
      role: "superadmin",
      isActive: true,
    });

    console.log(`Superadmin created for ${email}`);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin().catch((error) => {
  console.error("Admin seed failed:", error.message);
  process.exitCode = 1;
});