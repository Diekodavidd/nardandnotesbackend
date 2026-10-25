
const express = require("express");
const auth = require("../controllers/adminAuthController");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

router.post("/login", auth.login);
router.get("/me", requireAdmin, auth.me);
router.post("/logout", auth.logout);

module.exports = router;
