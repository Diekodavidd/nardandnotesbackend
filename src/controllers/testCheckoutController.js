
const crypto = require("crypto");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { sendOrderConfirmation } = require("../services/orderEmailService");

const FREE_SHIPPING_CENTS = 10000;
const STANDARD_SHIPPING_CENTS = 599;

function makeOrderNumber() {
  return `NN-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function cleanShippingAddress(input = {}) {
  const address = {
    recipientName: String(input.recipientName || "").trim(),
    phone: String(input.phone || "").trim(),
    line1: String(input.line1 || "").trim(),
    line2: String(input.line2 || "").trim(),
    city: String(input.city || "").trim(),
    state: String(input.state || "").trim(),
    postalCode: String(input.postalCode || "").trim(),
    country: "US",
  };

  if (
    !address.recipientName ||
    !address.phone ||
    !address.line1 ||
    !address.city ||
    !address.state ||
    !address.postalCode
  ) {
    const error = new Error("Complete all required shipping address fields.");
    error.status = 400;
    throw error;
  }

  return address;
}

exports.createTestPurchase = async (req, res, next) => {
  try {
    // Fail closed. Never enable this endpoint in production.
    if (
      process.env.NODE_ENV === "production" ||
      process.env.ENABLE_TEST_PURCHASES !== "true"
    ) {
      return res.status(404).json({
        success: false,
        message: "Test purchases are disabled.",
      });
    }

    const shippingAddress = cleanShippingAddress(req.body?.shippingAddress);

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: "Add an email address to your account before ordering.",
      });
    }

    if (!user.cart?.length) {
      return res.status(400).json({
        success: false,
        message: "Your shopping bag is empty.",
      });
    }

    const orderItems = [];
    let subtotalInCents = 0;

    for (const cartItem of user.cart) {
      const product = await Product.findOne({
        _id: cartItem.productId,
        active: true,
      }).lean();

      if (!product) {
        return res.status(400).json({
          success: false,
          message: "A product in your bag is no longer available.",
        });
      }

      const variant = (product.variants || []).find(
        (entry) =>
          entry.sku === cartItem.sku &&
          entry.active !== false
      );

      if (!variant) {
        return res.status(400).json({
          success: false,
          message: `The selected option for ${product.name} is unavailable.`,
        });
      }

      const quantity = Number(cartItem.quantity);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        return res.status(400).json({
          success: false,
          message: "A cart quantity is invalid.",
        });
      }

      // This endpoint is strictly for testing.
      // It does not reserve/decrement stock or collect money.
      const unitPriceInCents = Number(variant.priceInCents);

      if (!Number.isInteger(unitPriceInCents) || unitPriceInCents < 0) {
        return res.status(400).json({
          success: false,
          message: `The price for ${product.name} is invalid.`,
        });
      }

      const lineTotalInCents = unitPriceInCents * quantity;
      subtotalInCents += lineTotalInCents;

      orderItems.push({
        product: product._id,
        productId: String(product._id),
        name: product.name,
        sku: variant.sku,
        size: variant.size || cartItem.size || "",
        quantity,
        unitPriceInCents,
        lineTotalInCents,
        selections: cartItem.selections || [],
        blendEvent: cartItem.blendEvent ?? null,
        imageUrl: product.imageUrl || "",
      });
    }

    const shippingInCents =
      subtotalInCents >= FREE_SHIPPING_CENTS
        ? 0
        : STANDARD_SHIPPING_CENTS;

    const totalInCents = subtotalInCents + shippingInCents;

    const order = await Order.create({
      user: user._id,
      orderNumber: makeOrderNumber(),
      items: orderItems,
      subtotalInCents,
      shippingInCents,
      discountInCents: 0,
      taxInCents: 0,
      totalInCents,
      currency: "usd",
      shippingAddress,
      status: "processing",
      paymentStatus: "paid",
testMode: true,
paidAt: new Date(),
      trackingNumber: "",
      trackingUrl: "",
      statusHistory: [
        {
          status: "processing",
          note: "Development test purchase. No payment was collected.",
          changedAt: new Date(),
        },
      ],
    });

    // The test order is now saved. Clear only after successful order creation.
    user.cart = [];
    await user.save();

    let emailStatus = "pending";

    try {
      const emailResult = await sendOrderConfirmation(order, user.email);

      emailStatus = emailResult.sent
        ? "sent"
        : emailResult.reason === "not_configured"
          ? "not_configured"
          : "failed";
    } catch (emailError) {
      console.error("Order email failed:", emailError);
      emailStatus = "failed";
    }

    order.emailStatus = emailStatus;
    if (emailStatus === "sent") order.emailSentAt = new Date();
    await order.save();

    return res.status(201).json({
      success: true,
      testMode: true,
      message: "Test order created. No payment was collected.",
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotalInCents: order.subtotalInCents,
        shippingInCents: order.shippingInCents,
        totalInCents: order.totalInCents,
        currency: order.currency,
        emailStatus: order.emailStatus,
      },
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};
