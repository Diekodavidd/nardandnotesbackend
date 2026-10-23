
require("dotenv").config();
const mongoose = require("mongoose");

const Order = require("../models/Order");
const Product = require("../models/Product");

const PromoCode = require("../models/PromoCode");

async function fixPromoRedemptions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const promoId = "6adb569e6c661e03b4a2dd51";

    const redemptionCount = await Order.countDocuments({
      promoCodeId: new mongoose.Types.ObjectId(promoId),
      discountInCents: { $gt: 0 },
    });

    const result = await PromoCode.updateOne(
      { _id: promoId },
      { $set: { redemptionCount } }
    );

    console.log("Matching discounted orders:", redemptionCount);
    console.log("Promo updated:", result.modifiedCount === 1);

  } catch (error) {
    console.error("Failed to update promo:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

fixPromoRedemptions();
