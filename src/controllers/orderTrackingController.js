
const Order = require("../models/Order");
const User = require("../models/User");
const { sendShippingUpdate } = require("../services/orderEmailService");

const ALLOWED_STATUSES = [
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

exports.updateTracking = async (req, res, next) => {
  try {
    const { status, trackingNumber = "", trackingUrl = "", note = "" } =
      req.body || {};

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status.",
      });
    }

    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // Test orders cannot be used as evidence of real payment.
    // They can be tracked for UI testing only.
    if (order.testMode !== true && order.paymentStatus !== "paid") {
      return res.status(409).json({
        success: false,
        message: "A real order must have verified payment before fulfillment.",
      });
    }

    const previousStatus = order.status;

    if (status === "shipped" && !String(trackingNumber).trim()) {
      return res.status(400).json({
        success: false,
        message: "Add a tracking number before marking an order as shipped.",
      });
    }

    if (trackingUrl) {
      let url;
      try {
        url = new URL(trackingUrl);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Tracking URL is invalid.",
        });
      }

      if (url.protocol !== "https:") {
        return res.status(400).json({
          success: false,
          message: "Tracking URL must use HTTPS.",
        });
      }
    }

    order.status = status;
    order.trackingNumber = String(trackingNumber).trim();
    order.trackingUrl = String(trackingUrl).trim();

    if (status === "shipped") order.shippedAt = new Date();
    if (status === "delivered") order.deliveredAt = new Date();

    order.statusHistory.push({
      status,
      note: String(note).trim().slice(0, 500),
      changedAt: new Date(),
    });

    await order.save();

    let emailStatus = "not_applicable";

    if (status === "shipped" && previousStatus !== "shipped") {
      const user = await User.findById(order.user).select("email");

      if (user?.email) {
        try {
          const result = await sendShippingUpdate(order, user.email);
          emailStatus = result.sent ? "sent" : result.reason;
        } catch (emailError) {
          console.error("Shipping notification failed:", emailError);
          emailStatus = "failed";
        }
      } else {
        emailStatus = "failed";
      }
    }

    return res.json({
      success: true,
      message: "Order tracking updated.",
      emailStatus,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        statusHistory: order.statusHistory,
      },
    });
  } catch (error) {
    next(error);
  }
};
