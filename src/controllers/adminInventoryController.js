const Product = require('../models/Product');
exports.updateVariantStock = async (req, res, next) => {
  try {
    const { sku } = req.params;
    const stock = Number(req.body?.stock);
    if (!sku || !Number.isInteger(stock) || stock < 0 || stock > 1000000) return res.status(400).json({ success: false, message: 'Stock must be a whole number between 0 and 1,000,000.' });
    const product = await Product.findOne({ 'variants.sku': sku });
    if (!product) return res.status(404).json({ success: false, message: 'Variant not found.' });
    const variant = product.variants.find((entry) => entry.sku === sku);
    variant.stock = stock;
    product.trackInventory = true;
    await product.save();
    return res.json({ success: true, sku, stock: variant.stock, trackInventory: product.trackInventory, outOfStock: variant.stock === 0 });
  } catch (error) { next(error); }
};
