const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/requireAuth");
const { createTestOrder } = require("../controllers/testOrderController");

router.post("/test", requireAuth, createTestOrder);

module.exports = router;