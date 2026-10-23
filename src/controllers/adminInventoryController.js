
const Product = require("../models/Product");

exports.inventoryOverview = async (req, res, next) => {
  try {
    const LOW_STOCK_THRESHOLD = 10;

    const products = await Product.find({})
      .select(
        "name slug type imageUrl variants trackInventory updatedAt active"
      )
      .lean();

    const inventory = products.flatMap((product) =>
      (product.variants || []).map((variant) => {
        const stock = Number(variant.stock ?? 0);

        return {
          _id: `${product._id}-${variant.sku}`,
          productId: product._id,
          name: product.name,
          slug: product.slug,
          type: product.type,
          image: product.imageUrl || "",
          sku: variant.sku,
          size: variant.size || "",
          priceInCents: Number(variant.priceInCents ?? 0),
          currency: "USD",
          stock,
          lowStockThreshold: LOW_STOCK_THRESHOLD,
          trackInventory: product.trackInventory !== false,
          active:
            product.active !== false && variant.active !== false,
          updatedAt: product.updatedAt || null,
          stockStatus:
            stock <= 0
              ? "out_of_stock"
              : stock <= LOW_STOCK_THRESHOLD
                ? "low_stock"
                : "in_stock",
        };
      })
    );

    const inStockCount = inventory.filter(
      (item) => item.stock > LOW_STOCK_THRESHOLD
    ).length;

    const lowStockCount = inventory.filter(
      (item) =>
        item.stock > 0 &&
        item.stock <= LOW_STOCK_THRESHOLD
    ).length;

    const outOfStockCount = inventory.filter(
      (item) => item.stock <= 0
    ).length;

    return res.status(200).json({
      success: true,
      inventory,
      items: inventory,
      summary: {
        variantCount: inventory.length,
        inStockCount,
        lowStockCount,
        outOfStockCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateVariantStock = async (req, res, next) => {
  try {
    const sku = String(req.params.sku || "").trim();
    const stock = Number(req.body?.stock);

    // Validate the SKU.
    if (!sku) {
      return res.status(400).json({
        success: false,
        message: "A variant SKU is required.",
      });
    }

    // Validate stock quantity.
    if (
      req.body?.stock === undefined ||
      req.body?.stock === null ||
      req.body?.stock === "" ||
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 1000000
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Stock must be a whole number between 0 and 1,000,000.",
      });
    }

    // Find the product containing this variant.
    const product = await Product.findOne({
      "variants.sku": sku,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Variant not found.",
      });
    }

    // Prevent stock changes for inactive products.
    if (product.active === false) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot update stock for an inactive product. Activate it first.",
      });
    }

    const variant = product.variants.find(
      (entry) => entry.sku === sku
    );

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Variant not found.",
      });
    }

    // Prevent stock changes for inactive variants.
    if (variant.active === false) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot update stock for an inactive variant. Activate it first.",
      });
    }

    // Update the inventory.
    variant.stock = stock;
    product.trackInventory = true;

    await product.save();

    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully.",
      sku: variant.sku,
      stock: variant.stock,
      trackInventory: product.trackInventory,
      outOfStock: variant.stock === 0,
      product: {
        id: product._id,
        name: product.name,
        active: product.active,
      },
      variant: {
        sku: variant.sku,
        size: variant.size,
        priceInCents: variant.priceInCents,
        stock: variant.stock,
        active: variant.active,
      },
    });
  } catch (error) {
    next(error);
  }
};
