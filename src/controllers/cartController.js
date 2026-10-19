
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");

const MAX_QTY = 20;

function isValidId(value) {
  return typeof value === "string" && mongoose.isValidObjectId(value);
}

function makeLineKey(productId, sku, selections = [], blendEvent = null) {
  // The same variant and custom selections should identify the same line.
  return JSON.stringify({
    productId: String(productId),
    sku: String(sku),
    selections,
    blendEvent,
  });
}

function normaliseItem(item) {
  const productId = String(item.productId || item.id || "");
  const sku = String(item.sku || item.no || "");

  if (!isValidId(productId) || !sku) {
    throw new Error("Each cart item requires a valid product ID and SKU.");
  }

  const quantity = Number(item.quantity ?? 1);

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_QTY
  ) {
    throw new Error(`Quantity must be between 1 and ${MAX_QTY}.`);
  }

  const selections = Array.isArray(item.selections)
    ? item.selections
    : [];

  const blendEvent = item.blendEvent ?? null;

  return {
    lineKey: makeLineKey(productId, sku, selections, blendEvent),
    productId,
    sku,
    size: String(item.size || ""),
    quantity,
    selections,
    blendEvent,
  };
}

async function getUserCart(userId) {
  const user = await User.findById(userId).select("cart").lean();

  if (!user) {
    const error = new Error("Customer account not found.");
    error.status = 404;
    throw error;
  }

  return user.cart || [];
}

async function getAvailableVariant(item) {
  const product = await Product.findOne({
    _id: item.productId,
    active: true,
  }).lean();

  if (!product) {
    const error = new Error("Product not found or unavailable.");
    error.status = 404;
    throw error;
  }

  const variant = (product.variants || []).find(
    (entry) =>
      entry.sku === item.sku &&
      entry.active !== false
  );

  if (!variant) {
    const error = new Error("The selected product option is unavailable.");
    error.status = 400;
    throw error;
  }

  if (
    product.trackInventory &&
    Number(variant.stock) < item.quantity
  ) {
    const error = new Error("There is not enough stock for this quantity.");
    error.status = 409;
    throw error;
  }

  return { product, variant };
}

async function sendCart(userId, res) {
  const cart = await getUserCart(userId);

  const productIds = [
    ...new Set(cart.map((item) => String(item.productId))),
  ];

  const products = await Product.find({
    _id: { $in: productIds },
  })
    .select("name slug imageUrl type tagline variants active trackInventory")
    .lean();

  const productMap = new Map(
    products.map((product) => [String(product._id), product])
  );

  const items = cart.map((item) => {
    const product = productMap.get(String(item.productId));
    const variant = product?.variants?.find(
      (entry) => entry.sku === item.sku
    );

    return {
      id: String(item.productId),
      productId: String(item.productId),
      lineKey: item.lineKey,
      key: item.lineKey,
      name: product?.name || "Unavailable fragrance",
      sku: item.sku,
      no: item.sku,
      size: item.size || variant?.size || "",
      quantity: item.quantity,
      priceInCents: variant?.priceInCents ?? 0,
      price: (variant?.priceInCents ?? 0) / 100,
      img: product?.imageUrl || "",
      selections: item.selections || [],
      blendEvent: item.blendEvent ?? null,
      unavailable: !product || product.active === false || !variant,
    };
  });

  return res.json({
    success: true,
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
  });
}

exports.getCart = async (req, res, next) => {
  try {
    return await sendCart(req.user._id, res);
  } catch (error) {
    next(error);
  }
};

exports.addItem = async (req, res, next) => {
  try {
    const item = normaliseItem(req.body || {});
    await getAvailableVariant(item);

    const user = await User.findById(req.user._id).select("cart");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const existing = user.cart.find(
      (entry) => entry.lineKey === item.lineKey
    );

    if (existing) {
      const newQuantity = existing.quantity + item.quantity;

      if (newQuantity > MAX_QTY) {
        return res.status(400).json({
          success: false,
          message: `You can add a maximum of ${MAX_QTY} of this item.`,
        });
      }

      await getAvailableVariant({ ...item, quantity: newQuantity });
      existing.quantity = newQuantity;
    } else {
      user.cart.push(item);
    }

    await user.save();
    return await sendCart(req.user._id, res);
  } catch (error) {
    if (error.message?.startsWith("Each cart item")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

exports.updateItem = async (req, res, next) => {
  try {
    const { lineKey } = req.params;
    const quantity = Number(req.body?.quantity);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QTY
    ) {
      return res.status(400).json({
        success: false,
        message: `Quantity must be between 1 and ${MAX_QTY}.`,
      });
    }

    const user = await User.findById(req.user._id).select("cart");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const item = user.cart.find(
      (entry) => entry.lineKey === lineKey
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found.",
      });
    }

    await getAvailableVariant({ ...item.toObject(), quantity });
    item.quantity = quantity;

    await user.save();
    return await sendCart(req.user._id, res);
  } catch (error) {
    next(error);
  }
};

exports.removeItem = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("cart");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    user.cart = user.cart.filter(
      (item) => item.lineKey !== req.params.lineKey
    );

    await user.save();
    return await sendCart(req.user._id, res);
  } catch (error) {
    next(error);
  }
};
