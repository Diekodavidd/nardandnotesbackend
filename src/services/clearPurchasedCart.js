
const User = require("../models/User");

async function clearPurchasedCart(userId, purchasedItems) {
  const user = await User.findById(userId).select("cart");

  if (!user) {
    throw new Error("Customer account not found while finalizing order.");
  }

  // Aggregate quantities in case the same SKU appears more than once.
  const purchasedQuantities = new Map();

  for (const item of purchasedItems) {
    const sku = String(item.sku || "");
    const quantity = Number(item.quantity || 0);

    if (!sku || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Invalid purchased cart item.");
    }

    purchasedQuantities.set(
      sku,
      (purchasedQuantities.get(sku) || 0) + quantity
    );
  }

  // Subtract only the quantities that were purchased.
  for (const [sku, purchasedQuantity] of purchasedQuantities) {
    let remainingToRemove = purchasedQuantity;

    for (const cartItem of user.cart) {
      if (cartItem.sku !== sku || remainingToRemove <= 0) {
        continue;
      }

      const cartQuantity = Number(cartItem.quantity || 0);
      const removeQuantity = Math.min(cartQuantity, remainingToRemove);

      cartItem.quantity = cartQuantity - removeQuantity;
      remainingToRemove -= removeQuantity;
    }

    // If the cart changed after checkout, don't delete unrelated items.
    // Leave any unmatched quantity alone and log it for investigation.
    if (remainingToRemove > 0) {
      console.warn(
        `Could not reconcile ${remainingToRemove} purchased unit(s) of SKU ${sku} for user ${userId}.`
      );
    }
  }

  user.cart = user.cart.filter((item) => item.quantity > 0);
  await user.save();

  return true;
}

module.exports = { clearPurchasedCart };
