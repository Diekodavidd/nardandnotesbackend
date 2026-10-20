
require("dotenv").config();

const mongoose = require("mongoose");
const Product = require("../models/Product");
const { fragrances } = require("./catalogueData");
const { productImages } = require("./productImages");

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getShippingData(item) {
  const weightGrams = Number(item.weightGrams);
  const originCountry = String(item.originCountry || "")
    .trim()
    .toUpperCase();

  if (!Number.isFinite(weightGrams) || weightGrams < 1) {
    throw new Error(
      `Add a valid weightGrams value to catalogueData.js for ${item.name}.`
    );
  }

  if (!/^[A-Z]{2}$/.test(originCountry)) {
    throw new Error(
      `Add a valid two-letter originCountry to catalogueData.js for ${item.name}.`
    );
  }

  return {
    weightGrams,
    originCountry,
    hsCode: item.hsCode || "",
  };
}

const fragranceProducts = fragrances.map((item) => ({
  name: item.name,
  slug: slugify(item.name),
  type: "fragrance",
  tagline: item.tagline,
  description: item.description,
  fragranceFamily: item.family,
  scentProfile: item.profile,
  openingNotes: item.opening,
  heartNotes: item.heart,
  dryDownNotes: item.dry,
  notes: [...item.opening, ...item.heart, ...item.dry],
  searchTags: item.tags,
  badge: item.badge || "",
  categories: [item.category],
  trackInventory: false,
  processingDaysMin: 3,
  processingDaysMax: 5,
  shipping: getShippingData(item),
  imageUrl: productImages[item.name] || "",
  active: true,
  variants: [
    {
      sku: `NN-${item.code}-050`,
      size: "50ml",
      priceInCents: 4500,
      stock: 0,
      active: true,
    },
    {
      sku: `NN-${item.code}-100`,
      size: "100ml",
      priceInCents: 8500,
      stock: 0,
      active: true,
    },
  ],
}));

const specialProducts = [
  {
    name: "Nard & Notes Discovery Set",
    slug: "nard-and-notes-discovery-set",
    imageUrl: productImages["Nard & Notes Discovery Set"] || "",
    type: "discovery-set",
    tagline: "Meet your next signature scent.",
    description:
      "Discover Nard & Notes at your own pace with six fragrance samples. Explore and compare each scent on your skin through its opening, heart and dry down before choosing a full-size bottle.",
    notes: [],
    searchTags: ["Discovery", "Samples", "Gift"],
    categories: [],
    trackInventory: false,
    processingDaysMin: 3,
    processingDaysMax: 5,
    shipping: {
      weightGrams: 180,
      originCountry: "US",
      hsCode: "",
    },
    discoveryOptions: {
      selectionCount: 6,
      vialSizeMl: 2,
      allowDuplicates: false,
    },
    variants: [
      {
        sku: "NN-DISC-6",
        size: "6 x 2ml",
        priceInCents: 2500,
        stock: 0,
        active: true,
      },
    ],
    active: true,
  },
  {
    name: "Complete Discovery Collection",
    slug: "complete-discovery-collection",
    imageUrl: productImages["Complete Discovery Collection"] || "",
    type: "discovery-set",
    tagline: "Experience the complete fragrance wardrobe.",
    description:
      "Experience all 17 signature Nard & Notes fragrances in one collection of 2ml samples. Explore fresh citrus, sensual florals, deep oud, warm gourmands and polished woods before choosing your favourites.",
    notes: [],
    searchTags: ["Discovery", "Complete Collection", "Samples"],
    categories: [],
    trackInventory: false,
    processingDaysMin: 3,
    processingDaysMax: 5,
    shipping: {
      weightGrams: 350,
      originCountry: "US",
      hsCode: "",
    },
    discoveryOptions: {
      selectionCount: 17,
      vialSizeMl: 2,
      allowDuplicates: false,
    },
    variants: [
      {
        sku: "NN-DISC-17",
        size: "17 x 2ml",
        priceInCents: 6000,
        stock: 0,
        active: true,
      },
    ],
    active: true,
  },
  {
    name: "Create Your Blend",
    slug: "custom-blend",
    imageUrl: productImages["Create Your Blend"] || "",
    type: "custom-blend",
    tagline: "Your fragrance. Your combination.",
    description:
      "Combine two to four Nard & Notes fragrances into one custom bottle. Recreate a blend from an event or create a combination uniquely yours. Our signature equal-blend method is used, and slight batch variations may occur.",
    notes: [],
    searchTags: ["Custom", "Blend", "Personalised Fragrance"],
    categories: [],
    trackInventory: false,
    processingDaysMin: 5,
    processingDaysMax: 7,
    shipping: {
      weightGrams: 250,
      originCountry: "US",
      hsCode: "",
    },
    customBlendOptions: {
      minSelections: 2,
      maxSelections: 4,
      blendingMethod: "equal",
    },
    variants: [
      {
        sku: "NN-CUSTOM-050",
        size: "50ml",
        priceInCents: 5000,
        stock: 0,
        active: true,
      },
      {
        sku: "NN-CUSTOM-100",
        size: "100ml",
        priceInCents: 9500,
        stock: 0,
        active: true,
      },
    ],
    active: true,
  },
];

async function seedProducts() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    // Validate all catalogue shipping data before connecting or writing.
    const products = [...fragranceProducts, ...specialProducts];

    for (const product of products) {
      if (
        !product.shipping ||
        !Number.isFinite(Number(product.shipping.weightGrams)) ||
        Number(product.shipping.weightGrams) < 1 ||
        !/^[A-Z]{2}$/.test(product.shipping.originCountry || "")
      ) {
        throw new Error(
          `Invalid shipping data for ${product.name}.`
        );
      }
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB:", mongoose.connection.name);

    let inserted = 0;
    let updated = 0;

    for (const product of products) {
      const existing = await Product.findOne({
        slug: product.slug,
      }).select("_id");

      if (existing) {
        // Update catalogue metadata and shipping.
        // Preserve existing variants, prices, SKUs and stock.
        const { variants, ...metadata } = product;

        await Product.updateOne(
          { _id: existing._id },
          {
            $set: metadata,
          },
          { runValidators: true }
        );

        updated++;
      } else {
        await Product.create(product);
        inserted++;
      }
    }

    console.log("Catalogue sync complete.");
    console.log("New products inserted:", inserted);
    console.log("Existing products updated:", updated);
    console.log("Total catalogue products:", products.length);

    const actualCount = await Product.countDocuments({
      active: true,
    });

    console.log("Active products in database:", actualCount);
  } catch (error) {
    console.error("Catalogue sync failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

seedProducts();
