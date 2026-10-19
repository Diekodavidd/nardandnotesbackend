const Stripe = require('stripe');
const Product = require('../models/Product');

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe is not configured on the server.'), { status: 503 });
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

exports.createCheckoutSession = async (req, res, next) => {
  try {
    const stripe = stripeClient();
    const rawItems = req.body.items;
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50) return res.status(400).json({ success: false, message: 'Your cart is empty or invalid.' });
    const lineItems = [];
    let subtotal = 0;
    for (const item of rawItems) {
      const sku = String(item.sku || '').trim();
      const quantity = Number(item.quantity);
      if (!sku || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return res.status(400).json({ success: false, message: 'A cart item is invalid.' });
      const product = await Product.findOne({ 'variants.sku': sku, active: true });
      const variant = product?.variants?.find((v) => v.sku === sku && v.active);
      if (!product || !variant) return res.status(400).json({ success: false, message: `One of your products is no longer available (${sku}).` });
      if (product.trackInventory && variant.stock < quantity) return res.status(400).json({ success: false, message: `${product.name} does not have enough stock.` });
      subtotal += variant.priceInCents * quantity;
      lineItems.push({ price_data: { currency: 'usd', product_data: { name: `${product.name} — ${variant.size}`, metadata: { sku } }, unit_amount: variant.priceInCents }, quantity });
    }
    const freeShipping = subtotal >= 10000;
    const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.user.email,
      client_reference_id: String(req.user._id),
      metadata: { userId: String(req.user._id), subtotalInCents: String(subtotal) },
      line_items: lineItems,
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: freeShipping ? 0 : 599, currency: 'usd' }, display_name: freeShipping ? 'Standard shipping (free)' : 'Standard shipping', delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } } } }],
      success_url: `${frontend}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/cart?checkout=cancelled`,
    });
    res.json({ success: true, url: session.url });
  } catch (error) { next(error); }
};
