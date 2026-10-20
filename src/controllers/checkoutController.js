const Stripe = require('stripe');
const Product = require('../models/Product');
const { validatePromo } = require('../services/promoService');
const { getRate } = require('../services/shippoService');

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
    let promo = null;
    let discountInCents = 0;
    if (req.body.promoCode) {
      const validated = await validatePromo(req.body.promoCode, subtotal);
      if (!validated.valid) return res.status(422).json({ success: false, message: validated.message });
      promo = validated; discountInCents = validated.discountInCents;
    }
    let shippingAmount = subtotal >= 10000 ? 0 : 599;
    let shippingName = shippingAmount === 0 ? 'Standard shipping (free)' : 'Standard shipping';
    let shippingProvider = '';
    if (req.body.shippingRateId) {
      const rate = await getRate(String(req.body.shippingRateId));
      if (String(rate.currency || '').toLowerCase() !== 'usd' || !Number.isFinite(Number(rate.amount)) || Number(rate.amount) < 0 || rate.object_id !== req.body.shippingRateId) {
        return res.status(400).json({ success: false, message: 'Selected shipping rate is invalid or not in USD.' });
      }
      shippingAmount = Math.round(Number(rate.amount) * 100);
      shippingName = `${rate.provider || 'Shipping'} — ${rate.servicelevel?.name || 'Selected service'}`;
      shippingProvider = String(rate.provider || '');
    }
    const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.user.email,
      client_reference_id: String(req.user._id),
      metadata: { userId: String(req.user._id), subtotalInCents: String(subtotal), discountCode: promo?.code || '', shippingProvider, shippingRateId: req.body.shippingRateId || '' },
      line_items: lineItems,
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: (process.env.SHIPPING_ALLOWED_COUNTRIES || 'NG').split(',').map((country) => country.trim().toUpperCase()).filter(Boolean) },
      shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: shippingAmount, currency: 'usd' }, display_name: shippingName, delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } } } }],
      ...(promo ? { discounts: [{ coupon: await stripe.coupons.create(promo.promo.type === 'percentage' ? { percent_off: promo.promo.value, duration: 'once', name: promo.code } : { amount_off: promo.discountInCents, currency: 'usd', duration: 'once', name: promo.code }).then((coupon) => coupon.id) }] } : {}),
      success_url: `${frontend}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/cart?checkout=cancelled`,
    });
    res.json({ success: true, url: session.url });
  } catch (error) { next(error); }
};
