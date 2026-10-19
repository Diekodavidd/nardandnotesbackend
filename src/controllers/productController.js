
const Product = require("../models/Product");

async function getProducts(req, res) {
  try {
    const { type, category, search } = req.query;

    const filter = { active: true };

    if (type) {
      const allowedTypes = [
        "fragrance",
        "discovery-set",
        "custom-blend",
      ];

      if (!allowedTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product type.",
        });
      }

      filter.type = type;
    }

    if (category) {
      const allowedCategories = ["For Her", "For Him", "Unisex"];

      if (!allowedCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category.",
        });
      }

      filter.categories = category;
    }

    if (search) {
      const safeSearch = String(search).trim().slice(0, 100);

      if (safeSearch) {
        filter.name = {
          $regex: safeSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        };
      }
    }

    const products = await Product.find(filter)
      .select("-__v")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get products error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve products.",
    });
  }
}

async function getProductBySlug(req, res) {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      active: true,
    })
      .select("-__v")
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve product.",
    });
  }
}

module.exports = {
  getProducts,
  getProductBySlug,
};
