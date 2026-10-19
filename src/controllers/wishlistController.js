
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");

const PRODUCT_FIELDS =
  "name slug imageUrl type tagline description variants categories";

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) &&
    String(new mongoose.Types.ObjectId(id)) === String(id);
}

// GET /api/account/wishlist
// Returns the current user's saved products and their IDs.
exports.getWishlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select("wishlist")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const wishlistIds = (user.wishlist || []).map(String);

    // Keep the existing WishlistPage response contract.
    const products = await Product.find({
      _id: { $in: wishlistIds },
      active: true,
    })
      .select(PRODUCT_FIELDS)
      .lean();

    // Match the order in which IDs were saved by the user.
    const byId = new Map(products.map((product) => [
      String(product._id),
      product,
    ]));

    const orderedProducts = wishlistIds
      .map((id) => byId.get(id))
      .filter(Boolean);

    return res.json({
      success: true,
      wishlistIds,
      products: orderedProducts,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/account/wishlist/:productId
// Save a product to the current user's wishlist.
exports.addToWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!validObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      active: true,
    }).select("_id");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unavailable.",
      });
    }

    const result = await User.updateOne(
      { _id: req.user._id },
      { $addToSet: { wishlist: product._id } }
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const user = await User.findById(req.user._id)
      .select("wishlist")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Fragrance saved to your wishlist.",
      wishlistIds: (user?.wishlist || []).map(String),
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/account/wishlist/:productId
// Remove a product from the current user's wishlist.
exports.removeFromWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!validObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const result = await User.updateOne(
      { _id: req.user._id },
      { $pull: { wishlist: new mongoose.Types.ObjectId(productId) } }
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const user = await User.findById(req.user._id)
      .select("wishlist")
      .lean();

    return res.json({
      success: true,
      message: "Fragrance removed from your wishlist.",
      wishlistIds: (user?.wishlist || []).map(String),
    });
  } catch (error) {
    next(error);
  }
};
