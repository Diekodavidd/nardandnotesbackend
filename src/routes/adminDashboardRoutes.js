
const express = require("express");
const requireAdmin = require("../middleware/requireAdmin");
const dashboard = require("../controllers/adminDashboardController");

const router = express.Router();

router.use(requireAdmin);

router.get("/overview", dashboard.overview);

router.get("/customers", dashboard.listCustomers);
router.get("/customers/:id", dashboard.customerDetails);

router.get("/fulfilment", dashboard.fulfilmentQueue);
router.patch(
  "/fulfilment/:orderId/status",
  dashboard.updateFulfilmentStatus
);

router.get("/inventory", dashboard.inventoryOverview);

router.get("/analytics", dashboard.analytics);

module.exports = router;
