const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      default: "",
      trim: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPriceInCents: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotalInCents: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    line1: {
      type: String,
      required: true,
      trim: true,
    },
    line2: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      default: "",
      trim: true,
    },
    postalCode: {
      type: String,
      default: "",
      trim: true,
    },
    country: {
      type: String,
      required: true,
      default: "US",
      uppercase: true,
      minlength: 2,
      maxlength: 2,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // Customer
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // Purchased products, resolved from trusted database data
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) =>
          Array.isArray(items) && items.length > 0,
        message: "An order must contain at least one item.",
      },
    },

    // All monetary values are in the currency's minor unit (cents for USD)
    subtotalInCents: {
      type: Number,
      required: true,
      min: 0,
    },
    shippingInCents: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountInCents: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxInCents: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalInCents: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },

    // Destination captured during Stripe Checkout
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },

    // Stripe payment records
    stripeCheckoutSessionId: {
      type: String,
      default: null,
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      default: "pending",
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },

    // Order lifecycle.
    // Purchasing a label must NOT change status to "shipped".
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    // Shippo shipment and rate selection
    shippoShipmentId: {
      type: String,
      default: "",
      trim: true,
    },
    shippoRateId: {
      type: String,
      default: "",
      trim: true,
    },
    shippoRateAmountInCents: {
      type: Number,
      default: null,
      min: 0,
    },
    shippoRateCurrency: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },
    shippingProvider: {
      type: String,
      default: "",
      trim: true,
    },

    // Actual label purchase results
    shippoTransactionId: {
      type: String,
      default: "",
      trim: true,
    },
    labelUrl: {
      type: String,
      default: "",
      trim: true,
    },
    labelPurchaseInProgress: {
      type: Boolean,
      default: false,
    },
    shippingLabelPurchasedAt: {
      type: Date,
      default: null,
    },

    // Actual shipping cost and store subsidy
    actualShippingCostInCents: {
      type: Number,
      default: null,
      min: 0,
    },
    actualShippingCostCurrency: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },
    storeShippingSubsidyInCents: {
      type: Number,
      default: null,
      min: 0,
    },

    // Tracking and dispatch
    trackingNumber: {
      type: String,
      default: "",
      trim: true,
    },
    trackingUrl: {
      type: String,
      default: "",
      trim: true,
    },
    shippedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },

    // Promotions
    discountCode: {
      type: String,
      default: "",
      trim: true,
    },
    promoCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromoCode",
      default: null,
    },

    // Test and email records
    testMode: {
      type: Boolean,
      default: false,
    },
    emailStatus: {
      type: String,
      enum: [
        "pending",
        "sent",
        "failed",
        "not_configured",
      ],
      default: "pending",
    },
    emailSentAt: {
      type: Date,
      default: null,
    },

    // Order audit trail
    statusHistory: {
      type: [
        {
          status: {
            type: String,
            enum: [
              "pending",
              "processing",
              "shipped",
              "delivered",
              "cancelled",
            ],
          },
          note: {
            type: String,
            default: "",
          },
          changedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Efficiently retrieve a customer's newest orders.
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index(
  { stripeCheckoutSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      stripeCheckoutSessionId: { $type: "string" },
    },
  }
);
module.exports = mongoose.model("Order", orderSchema);
