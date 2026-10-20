
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
      type: [{
        type: String,
        enum: ["For Her", "For Him", "Unisex"],
      }],
      default: [],
    },

    imageUrl: { type: String, default: "" },
shipping: {
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
},

    variants: {
      type: [variantSchema],
      validate: {
        validator: (variants) => variants.length > 0,
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
