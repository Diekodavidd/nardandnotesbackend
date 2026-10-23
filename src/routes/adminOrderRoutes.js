
const express = require("express");
const requireAdmin = require("../middleware/requireAdmin");
const admin = require("../controllers/adminOrderController");
const tracking = require("../controllers/orderTrackingController");

const router = express.Router();

router.use(requireAdmin);

router.get("/", admin.listOrders);
router.get("/:orderId", admin.getOrder);

// Regular orders — production shipping
router.post(
  "/:orderId/shipping-rates",
  admin.getOrderShippingRates
);

router.post(
  "/:orderId/shipping-rate",
  admin.selectOrderShippingRate
);

router.post(
  "/:orderId/purchase-label",
  admin.purchaseOrderLabel
);

// Test orders — Shippo test mode only
router.post(
  "/:orderId/test-shipping-rates",
  admin.getTestOrderShippingRates
);

router.post(
  "/:orderId/test-shipping-rate",
  admin.selectTestOrderShippingRate
);

router.post(
  "/:orderId/test-purchase-label",
  admin.purchaseTestOrderLabel
);

router.patch(
  "/:orderId/tracking",
  tracking.updateTracking
);

router.post(
  "/:orderId/retry-confirmation-email",
  admin.retryCustomerEmail
);

router.post(
  "/:orderId/retry-store-notification",
  admin.retryAdminNotification
);

router.post(
  "/:orderId/retry-shipping-email",
  admin.retryShippingEmail
);

module.exports = router;
