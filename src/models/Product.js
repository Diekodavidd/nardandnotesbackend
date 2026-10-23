
const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true },
    size: { type: String, required: true, trim: true },
    priceInCents: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["fragrance", "discovery-set", "custom-blend"],
      required: true,
    },

    tagline: { type: String, default: "" },
    description: { type: String, default: "" },
    fragranceFamily: { type: String, default: "" },
    scentProfile: { type: String, default: "" },

    openingNotes: { type: [String], default: [] },
    heartNotes: { type: [String], default: [] },
    dryDownNotes: { type: [String], default: [] },
    notes: { type: [String], default: [] },
    searchTags: { type: [String], default: [] },

    badge: { type: String, default: "" },

    categories: {
      type: [
        {
          type: String,
          enum: ["For Her", "For Him", "Unisex"],
        },
      ],
      default: [],
    },

    imageUrl: { type: String, default: "" },
// Shippo shipping-cost accounting.
// All monetary amounts are stored in integer cents.

shippoRateAmountInCents: {
  type: Number,
  default: null,
  min: 0,
},

shippoRateCurrency: {
  type: String,
  default: "",
  uppercase: true,
},

actualShippingCostInCents: {
  type: Number,
  default: null,
  min: 0,
},

actualShippingCostCurrency: {
  type: String,
  default: "",
  uppercase: true,
},

storeShippingSubsidyInCents: {
  type: Number,
  default: null,
  min: 0,
},

shippingLabelPurchasedAt: {
  type: Date,
  default: null,
},

labelPurchaseInProgress: {
  type: Boolean,
  default: false,
},

shippedAt: {
  type: Date,
  default: null,
},

deliveredAt: {
  type: Date,
  default: null,
},
    shipping: {
      // Total packed shipping weight for one sellable unit, in grams.
      weightGrams: {
        type: Number,
        required: true,
        min: 1,
      },
      originCountry: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        minlength: 2,
        maxlength: 2,
      },
      hsCode: {
        type: String,
        default: "",
        trim: true,
      },

      // Actual packed dimensions for one sellable unit, in inches.
      // Optional until existing products have been updated with measurements.
      lengthInches: {
        type: Number,
        min: 0.1,
        default: null,
      },
      widthInches: {
        type: Number,
        min: 0.1,
        default: null,
      },
      heightInches: {
        type: Number,
        min: 0.1,
        default: null,
      },
    },

    variants: {
      type: [variantSchema],
      validate: {
        validator: (variants) =>
          Array.isArray(variants) && variants.length > 0,
        message: "A product must have at least one variant.",
      },
    },

    trackInventory: { type: Boolean, default: true },

    discoveryOptions: {
      selectionCount: { type: Number, default: null },
      vialSizeMl: { type: Number, default: null },
      allowDuplicates: { type: Boolean, default: false },
    },

    customBlendOptions: {
      minSelections: { type: Number, default: null },
      maxSelections: { type: Number, default: null },
      blendingMethod: { type: String, default: "" },
    },

    processingDaysMin: { type: Number, default: 3 },
    processingDaysMax: { type: Number, default: 5 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ type: 1, active: 1 });
productSchema.index({ categories: 1, active: 1 });

module.exports = mongoose.model("Product", productSchema);
