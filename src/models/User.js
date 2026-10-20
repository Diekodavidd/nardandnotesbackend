
const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    lineKey: {
      type: String,
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    size: {
      type: String,
      default: "",
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      default: 1,
    },
    selections: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    blendEvent: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40, default: "Home" },
    recipientName: {
      type: String,
      trim: true,
      required: true,
      maxlength: 100,
    },
    phone: { type: String, trim: true, required: true, maxlength: 30 },
    line1: { type: String, trim: true, required: true, maxlength: 150 },
    line2: { type: String, trim: true, maxlength: 150, default: "" },
    city: { type: String, trim: true, required: true, maxlength: 100 },
    state: { type: String, trim: true, required: true, maxlength: 100 },
    postalCode: { type: String, trim: true, required: true, maxlength: 20 },
    country: {
      type: String,
      trim: true,
      required: true,
      default: "US",
      uppercase: true,
      minlength: 2,
      maxlength: 2,
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);


const preferencesSchema = new mongoose.Schema(
  {
    marketingEmails: { type: Boolean, default: false },
    orderUpdates: { type: Boolean, default: true },
    preferredCurrency: {
      type: String,
      enum: ["USD", "NGN", "GBP", "EUR"],
      default: "USD",
    },
    fragranceInterests: {
      type: [String],
      enum: [
        "For Her",
        "For Him",
        "Unisex",
        "Woody",
        "Floral",
        "Fresh",
        "Oriental",
      ],
      default: [],
    },
  },
  { _id: false }
);

const savedCardSchema = new mongoose.Schema(
  {
    stripePaymentMethodId: { type: String, required: true },
    brand: { type: String, default: "card" },
    last4: { type: String, default: "" },
    expMonth: { type: Number, default: null },
    expYear: { type: Number, default: null },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);


const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    firstName: { type: String, trim: true, maxlength: 60, default: "" },
    lastName: { type: String, trim: true, maxlength: 60, default: "" },

    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9._-]+$/,
      unique: true,
      sparse: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 254,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    dateOfBirth: { type: Date, default: null },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    gender: {
      type: String,
      enum: ["", "female", "male", "non_binary", "prefer_not_to_say"],
      default: "",
    },
    avatarUrl: { type: String, trim: true, maxlength: 1000, default: "" },

    addresses: { type: [addressSchema], default: [] },

    wishlist: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      }],
      default: [],
    },
cart: {
  type: [cartItemSchema],
  default: [],
},
    // Stripe customer reference; never store raw card numbers or CVVs.
    stripeCustomerId: {
      type: String,
      default: null,
      sparse: true,
    },

    savedCards: {
      type: [savedCardSchema],
      default: [],
    },

    preferences: {
      type: preferencesSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);



module.exports = mongoose.model("User", userSchema);
