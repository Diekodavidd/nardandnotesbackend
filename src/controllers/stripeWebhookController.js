
const Stripe = require("stripe");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const { clearPurchasedCart } = require("../services/clearPurchasedCart");
const { sendOrderConfirmation } = require("../services/orderEmailService");
const { sendNewOrderAlert } = require("../services/adminNotificationService");
const PromoCode = require("../models/PromoCode");

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is missing.");
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function attemptOrderConfirmation(order, email) {
  if (!order || order.emailStatus === "sent") {
    return {
      sent: order?.emailStatus === "sent",
      skipped: true,
    };
  }

  if (!email) {
    order.emailStatus = "failed";
    await order.save().catch((error) => {
      console.error("Could not update email status:", error.message);
    });

    return { sent: false, reason: "missing_email" };
  }

  try {
    const result = await sendOrderConfirmation(order, email);

    order.emailStatus = result.sent
      ? "sent"
      : result.reason === "not_configured"
        ? "not_configured"
        : "failed";

    if (result.sent) {
      order.emailSentAt = new Date();
    }

    await order.save();

    return result;
  } catch (error) {
    console.error("Order confirmation email failed:", error.message);

    order.emailStatus = "failed";

    await order.save().catch((saveError) => {
      console.error("Could not update email status:", saveError.message);
    });

    return { sent: false, reason: "failed" };
  }
}

exports.handleStripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  if (!process.env.STRIPE_WEBHOOK_SECRET || !signature) {
    return res.status(400).send("Missing Stripe webhook configuration.");
  }

  let event;

  try {
    const stripe = stripeClient();

    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Stripe signature verification failed:", error.message);
    return res.status(400).send("Invalid Stripe signature.");
  }

  const supportedEvents = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ];

  if (!supportedEvents.includes(event.type)) {
    return res.json({ received: true });
  }

  const session = event.data.object;

  if (session.payment_status !== "paid") {
    return res.json({
      received: true,
      ignored: "Payment is not complete.",
    });
  }

  try {
    // If Stripe retries, reuse the existing order. Never deduct stock
    // or redeem the promo code a second time.
    const existingOrder = await Order.findOne({
      stripeCheckoutSessionId: session.id,
    });

    if (existingOrder) {
      // Retry the customer email if it has not been sent.
      if (
        existingOrder.paymentStatus === "paid" &&
        existingOrder.status !== "cancelled" &&
        existingOrder.emailStatus !== "sent"
      ) {
        const existingUser = await User.findById(
          existingOrder.user
        ).select("email");

        if (existingUser?.email) {
          await attemptOrderConfirmation(
            existingOrder,
            existingUser.email
          );
        } else {
          console.error(
            "Cannot retry order email: customer email not found.",
            existingOrder.orderNumber
          );
        }
      }

      // Retry cart cleanup independently of email delivery.
      try {
        await clearPurchasedCart(
          existingOrder.user,
          existingOrder.items
        );
      } catch (error) {
        console.error("Retry cart cleanup failed:", error.message);
        return res.status(500).send(
          "Cart cleanup failed; retry webhook."
        );
      }

      return res.json({
        received: true,
        duplicate: true,
      });
    }

    const userId = session.metadata?.userId;

    if (!userId || userId !== session.client_reference_id) {
      console.error("Invalid user metadata for session:", session.id);
      return res.status(400).send("Invalid checkout metadata.");
    }

    const user = await User.findById(userId).select("name email");

    if (!user) {
      return res.status(400).send("Checkout user not found.");
    }

    const stripe = stripeClient();

    const fullSession = await stripe.checkout.sessions.retrieve(
      session.id,
      {
        expand: ["line_items.data.price.product"],
      }
    );

    const stripeItems = fullSession.line_items?.data || [];

    if (!stripeItems.length) {
      return res.status(400).send("Checkout contains no items.");
    }

    const items = [];

    for (const line of stripeItems) {
      const stripeProduct = line.price?.product;
      const sku = stripeProduct?.metadata?.sku;
      const quantity = line.quantity;

      if (!sku || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).send("Invalid Stripe line item.");
      }

      const product = await Product.findOne({
        "variants.sku": sku,
        active: true,
      });

      const variant = product?.variants?.find(
        (item) => item.sku === sku && item.active
      );

      if (!product || !variant) {
        console.error("Purchased product not found:", sku);
        return res.status(500).send(
          "Unable to resolve purchased product."
        );
      }

      items.push({
        product: product._id,
        name: product.name,
        slug: product.slug,
        imageUrl: product.imageUrl,
        sku,
        size: variant.size,
        quantity,
        unitPriceInCents: line.price.unit_amount,
        lineTotalInCents: line.amount_total,
      });
    }

    const shipping =
      fullSession.shipping_details ||
      fullSession.collected_information?.shipping_details;

    const address = shipping?.address;

    if (!shipping?.name || !address) {
      return res.status(400).send("Shipping details are missing.");
    }

    const subtotalInCents = fullSession.amount_subtotal;
    const totalInCents = fullSession.amount_total;
    const shippingInCents =
      fullSession.total_details?.amount_shipping || 0;
    const discountInCents =
      fullSession.total_details?.amount_discount || 0;
    const taxInCents =
      fullSession.total_details?.amount_tax || 0;

    if (
      !Number.isInteger(subtotalInCents) ||
      !Number.isInteger(totalInCents)
    ) {
      return res.status(400).send("Invalid payment totals.");
    }

    const orderNumber =
      `NN-${Date.now()}-${session.id.slice(-6).toUpperCase()}`;

    // Save the order after verifying the paid Stripe session.
    const order = await Order.create({
      user: user._id,
      orderNumber,
      items,
      subtotalInCents,
      shippingInCents,
      discountInCents,
      taxInCents,
      totalInCents,
      currency: fullSession.currency || "usd",

      shippingAddress: {
        recipientName: shipping.name,
        phone: shipping.phone || "",
        line1: address.line1,
        line2: address.line2 || "",
        city: address.city,
        state: address.state || "",
        postalCode: address.postal_code || "",
        country: String(address.country || "US").toUpperCase(),
      },

      stripeCheckoutSessionId: fullSession.id,

      stripePaymentIntentId:
        typeof fullSession.payment_intent === "string"
          ? fullSession.payment_intent
          : fullSession.payment_intent?.id,

      paymentStatus: "paid",
      status: "processing",
      discountCode: fullSession.metadata?.discountCode || "",
      shippingProvider: fullSession.metadata?.shippingProvider || "",
      shippoRateId: fullSession.metadata?.shippingRateId || "",

      testMode: String(
        process.env.STRIPE_SECRET_KEY || ""
      ).startsWith("sk_test_"),

      emailStatus: "pending",
      paidAt: new Date(),

      statusHistory: [
        {
          status: "pending",
          note: "Order created after verified Stripe payment.",
        },
        {
          status: "processing",
          note: "Payment confirmed by Stripe.",
        },
      ],
    });

    // Deduct stock only after payment confirmation.
    const decremented = [];

    try {
      for (const item of items) {
        const product = await Product.findById(item.product);

        if (!product?.trackInventory) continue;

        const result = await Product.updateOne(
          {
            _id: item.product,
            trackInventory: true,
            variants: {
              $elemMatch: {
                sku: item.sku,
                active: true,
                stock: { $gte: item.quantity },
              },
            },
          },
          {
            $inc: {
              "variants.$.stock": -item.quantity,
            },
          }
        );

        if (result.modifiedCount !== 1) {
          throw new Error(
            `Insufficient stock while finalising ${item.sku}.`
          );
        }

        decremented.push(item);
      }
    } catch (inventoryError) {
      // Restore stock already deducted during this attempt.
      for (const item of decremented) {
        await Product.updateOne(
          {
            _id: item.product,
            "variants.sku": item.sku,
          },
          {
            $inc: {
              "variants.$.stock": item.quantity,
            },
          }
        ).catch(() => {});
      }

      order.paymentStatus = "paid";
      order.status = "cancelled";

      order.statusHistory.push({
        status: "cancelled",
        note:
          "Paid order requires manual review because inventory could not be reserved.",
      });

      await order.save().catch(() => {});

      console.error(
        "Inventory finalisation failed for paid order",
        order.orderNumber,
        inventoryError.message
      );

      return res.status(500).send(
        "Inventory conflict; manual refund/review required."
      );
    }

    // Redeem the promo code only for this newly created order.
    if (order.discountCode) {
      await PromoCode.updateOne(
        {
          code: order.discountCode,
          active: true,
          $or: [
            { maxRedemptions: null },
            { maxRedemptions: { $exists: false } },
            {
              $expr: {
                $lt: ["$redemptionCount", "$maxRedemptions"],
              },
            },
          ],
        },
        {
          $inc: {
            redemptionCount: 1,
          },
        }
      ).catch((error) => {
        console.error(
          "Promo redemption count update failed:",
          error.message
        );
      });
    }

    // Send the real customer confirmation through Resend.
    // Email failure must not reverse or invalidate the payment.
    await attemptOrderConfirmation(order, user.email);

    // Notify the store independently of the customer email.
    try {
      const alertResult = await sendNewOrderAlert(order);

      if (!alertResult.sent) {
        console.warn(
          "Store order alert not sent:",
          alertResult.reason
        );
      }
    } catch (alertError) {
      console.error(
        "Store order alert failed:",
        alertError.message
      );
    }

    // Clear purchased quantities after the order has been saved.
    try {
      await clearPurchasedCart(user._id, order.items);
    } catch (cleanupError) {
      console.error("Cart cleanup failed:", cleanupError.message);

      return res.status(500).send(
        "Cart cleanup failed; retry webhook."
      );
    }

    return res.json({
      received: true,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);

    return res.status(500).send("Webhook processing failed.");
  }
};
