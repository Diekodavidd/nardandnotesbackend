
const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/requireAuth");

const { createTestOrder } = require("../controllers/testOrderController");

const devTestOrderController = require(
  "../controllers/devTestOrderController"
);

router.post("/test", requireAuth, createTestOrder);

router.post(
  "/dev-test-orders/rates",
  requireAuth,
  devTestOrderController.getTestShippingRates
);

router.post(
  "/dev-test-orders",
  requireAuth,
  devTestOrderController.createTestOrder
);
router.post(
  "/dev-test-orders/label",
  requireAuth,
  devTestOrderController.createTestShippingLabel
);
module.exports = router;
