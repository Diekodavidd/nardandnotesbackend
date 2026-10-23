const mongoose = require("mongoose");
const Order = require('../models/Order');
const User = require('../models/User');
const { sendOrderConfirmation, sendShippingUpdate } = require('../services/orderEmailService');
const { sendNewOrderAlert } = require('../services/adminNotificationService');
const {
  getRates,
  getRate,getShipment,
  purchaseLabel,
} = require("../services/shippoService");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireFulfillableOrder(order) {
  if (!order) throw httpError(404, "Order not found.");

  if (order.testMode === true) {
    throw httpError(409, "Test orders cannot be fulfilled.");
  }

  if (order.paymentStatus !== "paid") {
    throw httpError(409, "Only paid orders can be fulfilled.");
  }

  if (order.status === "cancelled") {
    throw httpError(409, "Cancelled orders cannot be fulfilled.");
  }

  if (order.shippoTransactionId || order.labelUrl) {
    throw httpError(409, "A shipping label has already been purchased.");
  }
}

function addressForShippo(order) {
  const address = order.shippingAddress || {};
  const email = order.user?.email || order.email || "";

  const country = String(address.country || "")
    .trim()
    .toUpperCase();

  if (country !== "US") {
    throw httpError(400, "Only US destinations are supported.");
  }

  const phone = String(address.phone || "").trim();

  if (
    !address.recipientName ||
    !address.line1 ||
    !address.city ||
    !address.state ||
    !address.postalCode ||
    !phone ||
    !email
  ) {
    throw httpError(
      400,
      "The order needs a complete shipping address, phone and customer email."
    );
  }

  return {
    name: address.recipientName,
    street1: address.line1,
    street2: address.line2 || "",
    city: address.city,
    state: address.state,
    zip: address.postalCode,
    country: "US",
    phone,
    email,
  };
}

function validateParcel(parcel) {
  if (!parcel || typeof parcel !== "object") {
    throw httpError(400, "Enter the packed parcel measurements.");
  }

  const weight = Number(parcel.weight);
  const length = Number(parcel.length);
  const width = Number(parcel.width);
  const height = Number(parcel.height);

  if (
    !Number.isFinite(weight) || weight <= 0 ||
    !Number.isFinite(length) || length <= 0 ||
    !Number.isFinite(width) || width <= 0 ||
    !Number.isFinite(height) || height <= 0
  ) {
    throw httpError(
      400,
      "Parcel weight and all three dimensions must be positive numbers."
    );
  }

  return {
    length: String(length),
    width: String(width),
    height: String(height),
    distance_unit: "in",
    weight: String(weight),
    mass_unit: "lb",
  };
}

// POST /api/admin/orders/:orderId/shipping-rates
// Body: { parcel: { length, width, height, weight } }
// Dimensions are inches; weight is pounds.
exports.getOrderShippingRates = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate("user", "name email");

    requireFulfillableOrder(order);

    const addressTo = addressForShippo(order);
    const parcel = validateParcel(req.body?.parcel);

    const result = await getRates({ addressTo, parcel });

    if (!result.rates.length) {
      return res.status(422).json({
        success: false,
        message: "Shippo returned no available rates for this parcel.",
        rates: [],
      });
    }

    return res.json({
      success: true,
      shipmentId: result.shipmentId,
      rates: result.rates,
    });
  } catch (error) {
    next(error);
  }
};

function requireShippoTestKey() {
  if (!String(process.env.SHIPPO_API_KEY || "").startsWith("shippo_test_")) {
    throw httpError(
      403,
      "A Shippo test API key is required. No live label may be purchased."
    );
  }
}

function requireTestOrder(order) {
  if (!order) throw httpError(404, "Order not found.");

  if (order.testMode !== true) {
    throw httpError(409, "This endpoint is for test orders only.");
  }

  if (order.status === "cancelled" || order.status === "delivered") {
    throw httpError(409, "This test order cannot be processed.");
  }

  if (String(order.currency || "USD").toUpperCase() !== "USD") {
    throw httpError(400, "Test shipping currently supports USD only.");
  }
}

// POST /admin/orders/:orderId/test-shipping-rates
exports.getTestOrderShippingRates = async (req, res, next) => {
  try {
    requireShippoTestKey();

    const order = await Order.findById(req.params.orderId)
      .populate("user", "name email");

    requireTestOrder(order);

    const addressTo = addressForShippo(order);
    const parcel = validateParcel(req.body?.parcel);

    const result = await getRates({ addressTo, parcel });

    order.shippoShipmentId = result.shipmentId || "";
    await order.save();

    return res.json({
      success: true,
      testOnly: true,
      shipmentId: result.shipmentId,
      rates: result.rates,
    });
  } catch (error) {
    next(error);
  }
};

// POST /admin/orders/:orderId/test-shipping-rate
exports.selectTestOrderShippingRate = async (req, res, next) => {
  try {
    requireShippoTestKey();

    const shippingRateId = String(
      req.body?.shippingRateId || ""
    ).trim();

    if (!shippingRateId) {
      throw httpError(400, "Select a Shippo rate first.");
    }

    const order = await Order.findById(req.params.orderId);
    requireTestOrder(order);

    if (order.labelUrl || order.shippoTransactionId) {
      throw httpError(409, "A label has already been created.");
    }

    const rate = await getRate(shippingRateId);

  const rateCurrency = String(rate.currency || "").toUpperCase();
const rateAmount = Number(rate.amount);

const orderCountry = String(
  order.shippingAddress?.country || ""
).toUpperCase();

const rateDestinationCountry = String(
  rate.address_to?.country || ""
).toUpperCase();

if (
  rate.object_id !== shippingRateId ||
  rateCurrency !== "USD" ||
  !Number.isFinite(rateAmount) ||
  rateAmount < 0 ||
  orderCountry !== "US" ||
  (rateDestinationCountry &&
    rateDestinationCountry !== "US")
) {
  console.error("Test shipping rate validation failed:", {
    requestedRateId: shippingRateId,
    returnedRateId: rate.object_id,
    rateCurrency,
    rateAmount: rate.amount,
    orderCountry,
    rateDestinationCountry,
  });

  throw httpError(
    400,
    "The selected test rate is invalid. Check the rate currency and US shipping destination."
  );
}
    const rateInCents = Math.round(Number(rate.amount) * 100);

    order.shippoRateId = shippingRateId;
    order.shippingProvider = rate.provider || "Shippo";
    order.shippoRateAmountInCents = rateInCents;
    order.shippoRateCurrency = "USD";
    order.storeShippingSubsidyInCents = Math.max(
      0,
      rateInCents - Number(order.shippingInCents || 0)
    );

    await order.save();

    return res.json({
      success: true,
      testOnly: true,
      shippoRateId: order.shippoRateId,
      shippingProvider: order.shippingProvider,
      selectedRateInCents: rateInCents,
      currency: "USD",
    });
  } catch (error) {
    next(error);
  }
};

// POST /admin/orders/:orderId/test-purchase-label
exports.purchaseTestOrderLabel = async (req, res, next) => {
  try {
    requireShippoTestKey();

    const order = await Order.findById(req.params.orderId);
    requireTestOrder(order);

    if (!order.shippoRateId) {
      throw httpError(409, "Select and save a test shipping rate first.");
    }

    if (order.labelUrl || order.shippoTransactionId) {
      throw httpError(409, "A shipping label already exists.");
    }

const rate = await getRate(order.shippoRateId);

const shipmentId = String(rate.shipment || "").trim();

if (!shipmentId) {
  throw new Error(
    "The saved test shipping rate has no associated shipment."
  );
}

const shipment = await getShipment(shipmentId);

const destinationCountry = String(
  shipment.address_to?.country || ""
).trim().toUpperCase();

const rateIdMatches =
  String(rate.object_id || "") ===
  String(order.shippoRateId || "");

const currencyIsValid =
  String(rate.currency || "").toUpperCase() === "USD";

const destinationIsValid =
  destinationCountry === "US";

console.log("[Shippo test rate validation]", {
  savedRateId: order.shippoRateId,
  returnedRateId: rate.object_id,
  shipmentId,
  destinationCountry: destinationCountry || null,
  currency: rate.currency,
  rateIdMatches,
  currencyIsValid,
  destinationIsValid,
});
console.log("[TEST LABEL] Validation passed; calling purchaseLabel", {
  rateId: order.shippoRateId,
});
if (
  !rateIdMatches ||
  !currencyIsValid ||
  !destinationIsValid
) {
  const error = new Error(
    "The saved test shipping rate is invalid."
  );
  error.status = 400;
  throw error;
}

   const transaction = await purchaseLabel(order.shippoRateId);

console.log("[Shippo test transaction response]", {
  transactionId: transaction.object_id || null,
  status: transaction.status || null,
  test: transaction.test ?? null,
  hasLabelUrl: Boolean(transaction.label_url),
  messages: transaction.messages || [],
  error: transaction.status_details || transaction.object_state || null,
});

if (
  transaction.test !== true ||
  transaction.status !== "SUCCESS" ||
  !transaction.object_id ||
  !transaction.label_url
) {
  const shippoMessage = (transaction.messages || [])
    .map((message) => message.text)
    .filter(Boolean)
    .join("; ");

  throw httpError(
    502,
    shippoMessage
      ? `Shippo could not create the label: ${shippoMessage}`
      : "Shippo could not confirm a successful test label."
  );
}
    const actualCost = Number(
      transaction.rate?.amount ?? rate.amount
    );

    const actualCurrency = String(
      transaction.rate?.currency ?? rate.currency ?? ""
    ).toUpperCase();

    if (
      !Number.isFinite(actualCost) ||
      actualCost < 0 ||
      actualCurrency !== "USD"
    ) {
      throw httpError(502, "The test label returned an invalid cost.");
    }

    order.shippoTransactionId = transaction.object_id;
    order.labelUrl = transaction.label_url;
    order.shippingProvider =
      transaction.rate?.provider || rate.provider || order.shippingProvider;
    order.trackingNumber = transaction.tracking_number || "";
    order.trackingUrl = transaction.tracking_url_provider || "";
    order.actualShippingCostInCents = Math.round(actualCost * 100);
    order.actualShippingCostCurrency = "USD";
    order.storeShippingSubsidyInCents = Math.max(
      0,
      Math.round(actualCost * 100) -
        Number(order.shippingInCents || 0)
    );
    order.shippingLabelPurchasedAt = new Date();

    await order.save();

    return res.json({
      success: true,
      testOnly: true,
      message: "Shippo test label created successfully.",
      labelUrl: order.labelUrl,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      shippingProvider: order.shippingProvider,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/orders/:orderId/shipping-rate
// Body: { shippingRateId }

exports.selectOrderShippingRate = async (req, res, next) => {
  try {
    const shippingRateId = String(
      req.body?.shippingRateId || ""
    ).trim();

    if (!shippingRateId) {
      throw httpError(400, "Select a Shippo rate first.");
    }

    const order = await Order.findById(req.params.orderId);
    requireFulfillableOrder(order);

    const rate = await getRate(shippingRateId);

    const rateCurrency = String(rate.currency || "").toUpperCase();
    const orderCurrency = String(order.currency || "USD").toUpperCase();
    const rateAmount = Number(rate.amount);

    if (
      rate.object_id !== shippingRateId ||
      rateCurrency !== orderCurrency ||
      !Number.isFinite(rateAmount) ||
      rateAmount < 0
    ) {
      throw httpError(
        400,
        "The selected Shippo rate has an invalid amount or currency."
      );
    }

    const rateInCents = Math.round(rateAmount * 100);

    // Customer shipping revenue is not changed.
    // This is an internal comparison only.
    const storeSubsidyInCents = Math.max(
      0,
      rateInCents - Number(order.shippingInCents || 0)
    );

    order.shippoRateId = shippingRateId;
    order.shippingProvider = rate.provider || "Shippo";
    order.shippoRateAmountInCents = rateInCents;
    order.shippoRateCurrency = rateCurrency;
    order.storeShippingSubsidyInCents = storeSubsidyInCents;

    await order.save();

    return res.json({
      success: true,
      shippoRateId: order.shippoRateId,
      shippingProvider: order.shippingProvider,
      customerShippingPaidInCents: Number(order.shippingInCents || 0),
      selectedRateInCents: rateInCents,
      storeShippingSubsidyInCents: storeSubsidyInCents,
      currency: rateCurrency,
      message:
        "Shipping rate saved. Customer checkout totals remain unchanged.",
    });
  } catch (error) {
    next(error);
  }
};


// POST /api/admin/orders/:orderId/purchase-label
exports.purchaseOrderLabel = async (req, res, next) => {
  let claimedOrderId;

  try {
    // Atomic claim prevents two dashboard requests from buying the same label.
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.orderId,
        paymentStatus: "paid",
        testMode: { $ne: true },
        status: { $nin: ["cancelled", "delivered"] },
        shippoRateId: { $exists: true, $nin: ["", null] },
        shippoTransactionId: { $in: ["", null] },
        labelUrl: { $in: ["", null] },
        labelPurchaseInProgress: { $ne: true },
      },
      { $set: { labelPurchaseInProgress: true } },
      { new: true }
    );

    if (!order) {
      throw httpError(
        409,
        "Order is not eligible, has no saved rate, or a label purchase is already in progress."
      );
    }

    claimedOrderId = order._id;

    const rate = await getRate(order.shippoRateId);

    if (
      rate.object_id !== order.shippoRateId ||
      String(rate.currency || "").toUpperCase() !== "USD"
    ) {
      throw httpError(400, "The saved Shippo rate is invalid.");
    }

    const transaction = await purchaseLabel(order.shippoRateId);

    if (
      transaction.status !== "SUCCESS" ||
      !transaction.object_id ||
      !transaction.label_url
    ) {
      throw httpError(502, "Shippo did not confirm a successful label purchase.");
    }

    order.shippoTransactionId = transaction.object_id;
    order.labelUrl = transaction.label_url;
    order.shippingProvider =
      transaction.rate?.provider || order.shippingProvider;
    order.trackingNumber =
      transaction.tracking_number || order.trackingNumber;
    order.trackingUrl =
      transaction.tracking_url_provider || order.trackingUrl;
    order.labelPurchaseInProgress = false;

const actualCost = Number(
  transaction.rate?.amount ?? rate.amount
);

const actualCurrency = String(
  transaction.rate?.currency ?? rate.currency ?? ""
).toUpperCase();

const orderCurrency = String(
  order.currency || "USD"
).toUpperCase();

if (
  !Number.isFinite(actualCost) ||
  actualCost < 0 ||
  actualCurrency !== orderCurrency
) {
  throw httpError(
    502,
    "The purchased shipping rate has an invalid amount or currency."
  );
}

const actualCostInCents = Math.round(actualCost * 100);

order.actualShippingCostInCents = actualCostInCents;
order.actualShippingCostCurrency = actualCurrency;

order.storeShippingSubsidyInCents = Math.max(
  0,
  actualCostInCents - Number(order.shippingInCents || 0)
);

order.shippingLabelPurchasedAt = new Date();

    await order.save();

    return res.json({
      success: true,
      labelUrl: order.labelUrl,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      shippingProvider: order.shippingProvider,
    });
  } catch (error) {
    // Release the claim after a known failure.
    // If a network timeout made the purchase outcome ambiguous, verify the
    // transaction in Shippo before attempting another purchase.
    if (claimedOrderId) {
      await Order.updateOne(
        { _id: claimedOrderId, shippoTransactionId: { $in: ["", null] } },
        { $set: { labelPurchaseInProgress: false } }
      ).catch(() => {});
    }

    next(error);
  }
};
exports.getOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    const order = await Order.findById(orderId)
      .populate("user", "name firstName lastName email")
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
};
exports.listOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email').lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ success: true, orders, page, limit, total });
  } catch (error) { next(error); }
};
exports.retryCustomerEmail = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const user = await User.findById(order.user).select('email');
    if (!user?.email) return res.status(409).json({ success: false, message: 'Customer email is unavailable.' });
    const result = await sendOrderConfirmation(order, user.email);
    order.emailStatus = result.sent ? 'sent' : result.reason === 'not_configured' ? 'not_configured' : 'failed';
    if (result.sent) order.emailSentAt = new Date();
    await order.save();
    res.json({ success: result.sent, emailStatus: order.emailStatus, message: result.sent ? 'Confirmation email sent.' : 'Email could not be sent.' });
  } catch (error) { next(error); }
};
exports.retryAdminNotification = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const result = await sendNewOrderAlert(order);
    res.status(result.sent ? 200 : 503).json({ success: result.sent, message: result.sent ? 'Store notification sent.' : 'Store notification failed or is not configured.' });
  } catch (error) { next(error); }
};
exports.retryShippingEmail = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.status !== 'shipped') return res.status(409).json({ success: false, message: 'Only shipped orders can receive a shipping update.' });
    const user = await User.findById(order.user).select('email');
    if (!user?.email) return res.status(409).json({ success: false, message: 'Customer email is unavailable.' });
    const result = await sendShippingUpdate(order, user.email);
    res.status(result.sent ? 200 : 503).json({ success: result.sent, message: result.sent ? 'Shipping update sent.' : 'Shipping update failed or is not configured.' });
  } catch (error) { next(error); }
};
