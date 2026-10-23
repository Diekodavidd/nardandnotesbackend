
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");

const PRODUCT_TYPES = [
  "fragrance",
  "discovery-set",
  "custom-blend",
];

const CATEGORIES = ["For Her", "For Him", "Unisex"];

const ARRAY_FIELDS = [
  "openingNotes",
  "heartNotes",
  "dryDownNotes",
  "notes",
  "searchTags",
  "categories",
];

const TEXT_FIELDS = [
  "name",
  "slug",
  "tagline",
  "description",
  "fragranceFamily",
  "scentProfile",
  "badge",
  "imageUrl",
];

const NUMBER_FIELDS = [
  "processingDaysMin",
  "processingDaysMax",
];

const BOOLEAN_FIELDS = ["active", "trackInventory"];

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

function cleanString(value, maxLength = 2000) {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, maxLength);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateProductPayload(body, partial = false) {
  const errors = [];
  const data = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { errors: ["A product object is required."], data };
  }

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue;

    const value = cleanString(
      body[field],
      field === "description" ? 10000 : 500
    );

    if (value === null) {
      errors.push(`${field} must be text.`);
    } else {
      data[field] = value;
    }
  }

  if (body.name !== undefined && !data.name) {
    errors.push("Product name is required.");
  }

  if (body.slug !== undefined) {
    data.slug = slugify(body.slug);
    if (!data.slug) errors.push("A valid product slug is required.");
  } else if (body.name !== undefined && !partial) {
    data.slug = slugify(body.name);
  }

  if (body.type !== undefined) {
    if (!PRODUCT_TYPES.includes(body.type)) {
      errors.push("Invalid product type.");
    } else {
      data.type = body.type;
    }
  }

  if (body.type === undefined && !partial) {
    errors.push("Product type is required.");
  }

  for (const field of ARRAY_FIELDS) {
    if (body[field] === undefined) continue;

    if (!Array.isArray(body[field])) {
      errors.push(`${field} must be an array.`);
      continue;
    }

    const values = body[field].map((value) =>
      typeof value === "string" ? value.trim() : ""
    );

    if (values.some((value) => !value)) {
      errors.push(`${field} must contain non-empty text values.`);
      continue;
    }

    if (
      field === "categories" &&
      values.some((value) => !CATEGORIES.includes(value))
    ) {
      errors.push("Categories must be For Her, For Him or Unisex.");
      continue;
    }

    data[field] = [...new Set(values)];
  }

  for (const field of BOOLEAN_FIELDS) {
    if (body[field] === undefined) continue;

    if (typeof body[field] !== "boolean") {
      errors.push(`${field} must be true or false.`);
    } else {
      data[field] = body[field];
    }
  }

  for (const field of NUMBER_FIELDS) {
    if (body[field] === undefined) continue;

    const value = Number(body[field]);

    if (!Number.isInteger(value) || value < 0 || value > 365) {
      errors.push(`${field} must be a whole number from 0 to 365.`);
    } else {
      data[field] = value;
    }
  }

  if (data.processingDaysMin !== undefined &&
      data.processingDaysMax !== undefined &&
      data.processingDaysMin > data.processingDaysMax) {
    errors.push("Minimum processing days cannot exceed maximum days.");
  }

  if (body.variants !== undefined || !partial) {
    if (!Array.isArray(body.variants) || body.variants.length === 0) {
      errors.push("At least one product variant is required.");
    } else {
      const seenSkus = new Set();

      data.variants = body.variants.map((variant, index) => {
        if (!variant || typeof variant !== "object") {
          errors.push(`Variant ${index + 1} is invalid.`);
          return null;
        }

        const sku = cleanString(variant.sku, 100);
        const size = cleanString(variant.size, 100);
        const priceInCents = Number(variant.priceInCents);
        const stock = Number(variant.stock ?? 0);
        const active = variant.active ?? true;

        if (!sku) errors.push(`Variant ${index + 1} needs a SKU.`);
        if (!size) errors.push(`Variant ${index + 1} needs a size.`);

        if (sku && seenSkus.has(sku.toLowerCase())) {
          errors.push(`Duplicate SKU: ${sku}.`);
        }
        if (sku) seenSkus.add(sku.toLowerCase());

        if (!Number.isSafeInteger(priceInCents) || priceInCents < 0) {
          errors.push(`Variant ${index + 1} has an invalid price in cents.`);
        }

        if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
          errors.push(`Variant ${index + 1} has invalid stock.`);
        }

        if (typeof active !== "boolean") {
          errors.push(`Variant ${index + 1} active must be boolean.`);
        }

        return { sku, size, priceInCents, stock, active };
      }).filter(Boolean);
    }
  }

  if (body.shipping !== undefined || !partial) {
    const shipping = body.shipping;

    if (!shipping || typeof shipping !== "object" || Array.isArray(shipping)) {
      errors.push("Shipping information is required.");
    } else {
      const weightGrams = Number(shipping.weightGrams);
      const originCountry = cleanString(shipping.originCountry, 2)?.toUpperCase();
      const hsCode = cleanString(shipping.hsCode || "", 50) ?? "";

      if (!Number.isFinite(weightGrams) || weightGrams < 1) {
        errors.push("Shipping weight must be at least 1 gram.");
      }

      if (!originCountry || !/^[A-Z]{2}$/.test(originCountry)) {
        errors.push("Shipping origin country must be a two-letter country code.");
      }

      const dimensions = {};

      for (const field of ["lengthInches", "widthInches", "heightInches"]) {
        const value = shipping[field];

        if (value === undefined || value === null || value === "") {
          dimensions[field] = null;
          continue;
        }

        const number = Number(value);

        if (!Number.isFinite(number) || number <= 0) {
          errors.push(`${field} must be greater than zero.`);
        } else {
          dimensions[field] = number;
        }
      }

      data.shipping = {
        weightGrams,
        originCountry,
        hsCode,
        ...dimensions,
      };
    }
  }

  for (const field of ["discoveryOptions", "customBlendOptions"]) {
    if (body[field] === undefined) continue;

    if (!body[field] || typeof body[field] !== "object" ||
        Array.isArray(body[field])) {
      errors.push(`${field} must be an object.`);
    } else {
      data[field] = body[field];
    }
  }

  if (
    data.type === "discovery-set" &&
    data.discoveryOptions === undefined &&
    !partial
  ) {
    data.discoveryOptions = {};
  }

  if (
    data.type === "custom-blend" &&
    data.customBlendOptions === undefined &&
    !partial
  ) {
    data.customBlendOptions = {};
  }

  return { errors, data };
}

// GET /api/admin/products
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 25)
    );
    const search = String(req.query.search || "").trim().slice(0, 100);
    const filter = {};

    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;

    if (PRODUCT_TYPES.includes(req.query.type)) {
      filter.type = req.query.type;
    } else if (req.query.type) {
      return sendError(res, 400, "Invalid product type.");
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { slug: { $regex: escaped, $options: "i" } },
        { "variants.sku": { $regex: escaped, $options: "i" } },
      ];
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select("-__v")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      products,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/products
exports.create = async (req, res, next) => {
  try {
    const { errors, data } = validateProductPayload(req.body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors.join(" "),
        errors,
      });
    }

    if (!data.slug) data.slug = slugify(data.name);

    if (await Product.exists({ slug: data.slug })) {
      return sendError(res, 409, "That product slug already exists.");
    }

    const existingSkus = data.variants.map((variant) => variant.sku);
    const skuConflict = await Product.exists({
      "variants.sku": { $in: existingSkus },
    });

    if (skuConflict) {
      return sendError(res, 409, "One or more SKUs already exist.");
    }

    const product = await Product.create(data);

    return res.status(201).json({
      success: true,
      product,
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "The product slug or SKU already exists.");
    }
    next(error);
  }
};

// PATCH /api/admin/products/:id
exports.update = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid product ID.");
    }

    const { errors, data } = validateProductPayload(req.body, true);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors.join(" "),
        errors,
      });
    }

    if (!Object.keys(data).length) {
      return sendError(res, 400, "Provide at least one field to update.");
    }

    const current = await Product.findById(req.params.id);

    if (!current) return sendError(res, 404, "Product not found.");

    if (data.slug && data.slug !== current.slug) {
      if (await Product.exists({
        slug: data.slug,
        _id: { $ne: current._id },
      })) {
        return sendError(res, 409, "That product slug already exists.");
      }
    }

    if (data.variants) {
      const skus = data.variants.map((variant) => variant.sku);

      const conflict = await Product.exists({
        _id: { $ne: current._id },
        "variants.sku": { $in: skus },
      });

      if (conflict) {
        return sendError(res, 409, "One or more SKUs belong to another product.");
      }

      const oldStockBySku = new Map(
        current.variants.map((variant) => [variant.sku, variant.stock])
      );

      // Prevent an ordinary product edit from silently resetting stock.
      data.variants = data.variants.map((variant) => ({
        ...variant,
        stock: oldStockBySku.has(variant.sku)
          ? oldStockBySku.get(variant.sku)
          : variant.stock,
      }));
    }

    Object.assign(current, data);
    await current.save();

    return res.json({
      success: true,
      product: current,
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "The product slug or SKU already exists.");
    }
    next(error);
  }
};

// DELETE /api/admin/products/:id
// Soft delete to preserve product history for existing orders.
exports.remove = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid product ID.");
    }

    const product = await Product.findById(req.params.id);

    if (!product) return sendError(res, 404, "Product not found.");

    const skus = product.variants.map((variant) => variant.sku);

    const referencedByOrders = await Order.exists({
      "items.sku": { $in: skus },
    });

    if (referencedByOrders) {
      product.active = false;
      product.variants.forEach((variant) => {
        variant.active = false;
      });
      await product.save();

      return res.json({
        success: true,
        archived: true,
        message: "Product archived because it is referenced by orders.",
      });
    }

    // Keep the record and its unique slug; never physically delete it here.
    product.active = false;
    product.variants.forEach((variant) => {
      variant.active = false;
    });
    await product.save();

    return res.json({
      success: true,
      archived: true,
      message: "Product has been deactivated.",
    });
  } catch (error) {
    next(error);
  }
};
