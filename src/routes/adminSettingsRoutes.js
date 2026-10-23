const express = require("express");
const requireAdmin = require("../middleware/requireAdmin");
const controller = require("../controllers/adminSettingsController");

const router = express.Router();

router.use(requireAdmin);

router.get("/", controller.getSettings);
router.put("/", controller.updateSettings);

module.exports = router;