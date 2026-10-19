
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
    recipientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: "", trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, default: "US", enum: ["US"] },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // Customer who placed the order
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Unique, human-readable order reference
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "An order must contain at least one item.",
      },
    },

    // All monetary amounts are stored in cents
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

    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },

    // Stripe payment information
    stripeCheckoutSessionId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
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

    // Fulfilment status
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

    shippingProvider: {
      type: String,
      default: "",
      trim: true,
    },
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

    discountCode: {
      type: String,
      default: "",
      trim: true,
    },
testMode: {
  type: Boolean,
  default: false,
},
emailStatus: {
  type: String,
  enum: ["pending", "sent", "failed", "not_configured"],
  default: "pending",
},
emailSentAt: {
  type: Date,
  default: null,
},
shippedAt: {
  type: Date,
  default: null,
},
deliveredAt: {
  type: Date,
  default: null,
},
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
      note: String,
      changedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  default: [],
},
    paidAt: {
      type: Date,
      default: null,
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


module.exports = mongoose.model("Order", orderSchema);
