
const crypto = require("crypto");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { sendOrderConfirmation } = require("../services/orderEmailService");

const FREE_SHIPPING_CENTS = 10000;
const STANDARD_SHIPPING_CENTS = 599;
const MAX_QTY_PER_SKU = 10;

function makeOrderNumber() {
  return `NN-TEST-${Date.now()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

async function restoreStock(reservations) {
  for (const reservation of [...reservations].reverse()) {
    await Product.updateOne(
      {
        _id: reservation.productId,
        "variants.sku": reservation.sku,
      },
      {
        $inc: {
          "variants.$.stock": reservation.quantity,
        },
      }
    );
  }
}

exports.createTestOrder = async (req, res) => {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_TEST_PURCHASES !== "true"
  ) {
    return res.status(404).json({
      success: false,
      message: "Test purchases are unavailable.",
    });
  }

  const reservations = [];
  let orderCreated = false;

  try {
    const { shippingAddressId, items: requestedItems } = req.body || {};

    if (!shippingAddressId) {
      return res.status(400).json({
        success: false,
        message: "Choose a delivery address.",
      });
    }

    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your bag is empty.",
      });
    }

    const address = (req.user.addresses || []).find(
      (entry) => String(entry._id) === String(shippingAddressId)
    );

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "The selected delivery address was not found.",
      });
    }

    const shippingAddress = {
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 || "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: "US",
    };

    const requiredAddressFields = [
      "recipientName",
      "phone",
      "line1",
      "city",
      "state",
      "postalCode",
    ];

    if (
      requiredAddressFields.some(
        (field) => !String(shippingAddress[field] || "").trim()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete your delivery address before continuing.",
      });
    }

    // Validate and combine duplicate SKUs.
    const quantities = new Map();

    for (const item of requestedItems) {
      const sku = typeof item.sku === "string" ? item.sku.trim() : "";
      const quantity = Number(item.quantity);

      if (
        !sku ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_QTY_PER_SKU
      ) {
        return res.status(400).json({
          success: false,
          message: "One or more items have an invalid SKU or quantity.",
        });
      }

      const combined = (quantities.get(sku) || 0) + quantity;

      if (combined > MAX_QTY_PER_SKU) {
        return res.status(400).json({
          success: false,
          message: `A maximum of ${MAX_QTY_PER_SKU} units per SKU is allowed.`,
        });
      }

      quantities.set(sku, combined);
    }

    const orderItems = [];
    let subtotalInCents = 0;

    for (const [sku, quantity] of quantities) {
      const product = await Product.findOne({
        "variants.sku": sku,
        active: true,
      });

      if (!product) {
        throw new Error(`The product with SKU ${sku} is unavailable.`);
      }

      const variant = product.variants.find(
        (entry) => entry.sku === sku && entry.active
      );

      if (!variant) {
        throw new Error(`The selected variant ${sku} is unavailable.`);
      }

      const unitPriceInCents = Number(variant.priceInCents);

      if (!Number.isInteger(unitPriceInCents) || unitPriceInCents < 0) {
        throw new Error(`The price for ${product.name} is invalid.`);
      }

      // Reserve stock atomically when inventory tracking is enabled.
      if (product.trackInventory) {
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: product._id,
            variants: {
              $elemMatch: {
                sku,
                active: true,
                stock: { $gte: quantity },
              },
            },
          },
          {
            $inc: { "variants.$.stock": -quantity },
          },
          { new: true }
        );

        if (!updatedProduct) {
          throw new Error(
            `Insufficient stock for ${product.name} (${variant.size}).`
          );
        }

        reservations.push({
          productId: product._id,
          sku,
          quantity,
        });
      }

      const lineTotalInCents = unitPriceInCents * quantity;
      subtotalInCents += lineTotalInCents;

      orderItems.push({
        product: product._id,
        name: product.name,
        slug: product.slug,
        imageUrl: product.imageUrl || "",
        sku: variant.sku,
        size: variant.size,
        quantity,
        unitPriceInCents,
        lineTotalInCents,
      });
    }

    const shippingInCents =
      subtotalInCents === 0 || subtotalInCents >= FREE_SHIPPING_CENTS
        ? 0
        : STANDARD_SHIPPING_CENTS;

    // This is a simulated successful payment, not a real card charge.
    const order = await Order.create({
      user: req.user._id,
      orderNumber: makeOrderNumber(),
      items: orderItems,
      subtotalInCents,
      shippingInCents,
      discountInCents: 0,
      taxInCents: 0,
      totalInCents: subtotalInCents + shippingInCents,
      currency: "usd",
      shippingAddress,
      paymentStatus: "paid",
      status: "processing",
      testMode: true,
      paidAt: new Date(),
      emailStatus: "pending",
      statusHistory: [
        {
          status: "pending",
          note: "Test order created.",
          changedAt: new Date(),
        },
        {
          status: "processing",
          note: "Simulated payment successful; order is processing.",
          changedAt: new Date(),
        },
      ],
    });

    orderCreated = true;

    // Email failure must not undo an order that has already been saved.
    
let emailResult;

try {
  emailResult = await sendOrderConfirmation(
    order,
    req.user.email
  );
} catch (emailError) {
  console.error("Receipt email failed:", emailError);
  emailResult = { sent: false, reason: "failed" };
}

order.emailStatus = emailResult?.sent
  ? "sent"
  : emailResult?.reason === "not_configured"
    ? "not_configured"
    : "failed";

if (emailResult?.sent) {
  order.emailSentAt = new Date();
}

await order.save();


    return res.status(201).json({
      success: true,
      testMode: true,
      message: "Test order created successfully.",
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        testMode: order.testMode,
        subtotalInCents: order.subtotalInCents,
        shippingInCents: order.shippingInCents,
        totalInCents: order.totalInCents,
        currency: order.currency,
        emailStatus: order.emailStatus,
      },
    });
  } catch (error) {
    // Never restore stock for an order already saved successfully.
    if (!orderCreated) {
      try {
        await restoreStock(reservations);
      } catch (rollbackError) {
        console.error("Test-order stock restoration failed:", rollbackError);
      }
    }

    console.error("Test-order creation failed:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Could not create the test order.",
    });
  }
};
