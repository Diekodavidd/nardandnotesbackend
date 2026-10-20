
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendOrderConfirmation } = require('../services/orderEmailService');
const { getRates, getRate, purchaseLabel } = require('../services/shippoService');

function ensureDevTestingEnabled() {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ENABLE_DEV_TEST_ORDERS !== 'true'
  ) {
    const error = new Error('Development test orders are disabled.');
    error.status = 404;
    throw error;
  }
}

function cleanTestAddress(input = {}) {
  const address = {
    recipientName: String(input.recipientName || '').trim(),
    phone: String(input.phone || '').trim(),
    line1: String(input.line1 || '').trim(),
    line2: String(input.line2 || '').trim(),
    city: String(input.city || '').trim(),
    state: String(input.state || '').trim(),
    postalCode: String(input.postalCode || '').trim(),
    country: String(input.country || 'US').trim().toUpperCase(),
  };

  if (address.country !== 'US') {
    const error = new Error(
      'NARD & NOTES currently delivers only within the United States.'
    );
    error.status = 400;
    throw error;
  }

  address.country = 'US';

  if (
    !address.recipientName ||
    !address.phone ||
    !address.line1 ||
    !address.city ||
    !address.state ||
    !address.postalCode
  ) {
    const error = new Error(
      'Complete all required shipping address fields.'
    );
    error.status = 400;
    throw error;
  }

  return address;
}

// Build customs data from trusted database product information.
async function buildTestCustomsItems(requestedItems, destinationCountry) {
  const senderCountry = String(
    process.env.SHIPPO_FROM_COUNTRY || ''
  ).trim().toUpperCase();

  const destination = String(destinationCountry || '').trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(senderCountry)) {
    const error = new Error(
      'Configure SHIPPO_FROM_COUNTRY with the two-letter sender country code.'
    );
    error.status = 500;
    throw error;
  }

  if (destination === senderCountry) return [];

  if (
    !Array.isArray(requestedItems) ||
    requestedItems.length < 1 ||
    requestedItems.length > 50
  ) {
    const error = new Error(
      'Shipping-rate testing requires 1 to 50 items with SKU and quantity.'
    );
    error.status = 400;
    throw error;
  }

  const customsItems = [];

  for (const requested of requestedItems) {
    const sku = String(requested?.sku || '').trim();
    const quantity = Number(requested?.quantity);

    if (
      !sku ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      const error = new Error(
        'Each item needs a valid SKU and quantity from 1 to 10.'
      );
      error.status = 400;
      throw error;
    }

    const product = await Product.findOne({
      'variants.sku': sku,
      active: true,
    });

    const variant = product?.variants?.find(
      (entry) => entry.sku === sku && entry.active
    );

    if (!product || !variant) {
      const error = new Error(`Active product variant not found: ${sku}`);
      error.status = 400;
      throw error;
    }

    const weightGrams = Number(product.shipping?.weightGrams);
    const originCountry = String(
      product.shipping?.originCountry || ''
    ).trim().toUpperCase();
    const priceInCents = Number(variant.priceInCents);
    const hsCode = String(product.shipping?.hsCode || '').trim();

    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      const error = new Error(
        `Add a valid per-unit shipping.weightGrams value to ${product.name} (${sku}).`
      );
      error.status = 400;
      throw error;
    }

    if (!/^[A-Z]{2}$/.test(originCountry)) {
      const error = new Error(
        `Add a valid shipping.originCountry to ${product.name} (${sku}).`
      );
      error.status = 400;
      throw error;
    }

    if (!Number.isInteger(priceInCents) || priceInCents <= 0) {
      const error = new Error(`Invalid price for shipping test item: ${sku}`);
      error.status = 400;
      throw error;
    }

    customsItems.push({
      description: `${product.name} - ${variant.size || 'product'}`.slice(
        0,
        100
      ),
      quantity,
      net_weight: String(weightGrams),
      mass_unit: 'g',
      value_amount: (priceInCents / 100).toFixed(2),
      value_currency: 'USD',
      origin_country: originCountry,
      ...(hsCode ? { tariff_number: hsCode } : {}),
    });
  }

  return customsItems;
}

// POST /api/dev-test-orders/rates
// Shippo rate lookup for testing only; this does not set checkout shipping prices.
exports.getTestShippingRates = async (req, res, next) => {
  try {
    ensureDevTestingEnabled();

    const {
      addressTo,
      parcel,
      items: requestedItems,
    } = req.body || {};

    if (
      !addressTo ||
      typeof addressTo !== 'object' ||
      String(addressTo.country || '').trim().toUpperCase() !== 'US'
    ) {
      const error = new Error(
        'NARD & NOTES currently delivers only within the United States.'
      );
      error.status = 400;
      throw error;
    }

    const customsItems = await buildTestCustomsItems(
      requestedItems,
      'US'
    );

    const result = await getRates({
      addressTo: {
        ...addressTo,
        country: 'US',
      },
      parcel,
      customsItems,
    });

    return res.json({
      success: true,
      testOnly: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/dev-test-orders/label
// Creates a test label only. A live Shippo key is rejected.
exports.createTestShippingLabel = async (req, res, next) => {
  try {
    ensureDevTestingEnabled();

    const apiKey = String(process.env.SHIPPO_API_KEY || '');

    if (!apiKey.startsWith('shippo_test_')) {
      return res.status(403).json({
        success: false,
        message: 'A Shippo test API key is required. No label was purchased.',
      });
    }

    const shippingRateId = String(
      req.body?.shippingRateId || ''
    ).trim();

    if (!shippingRateId) {
      return res.status(400).json({
        success: false,
        message: 'Select a shipping rate first.',
      });
    }

    const rate = await getRate(shippingRateId);

    if (
      rate.object_id !== shippingRateId ||
      String(rate.currency || '').toUpperCase() !== 'USD' ||
      !Number.isFinite(Number(rate.amount)) ||
      Number(rate.amount) < 0 ||
      String(rate.address_to?.country || '').toUpperCase() !== 'US'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'The selected rate must be valid, in USD, and addressed to the US.',
      });
    }

    const transaction = await purchaseLabel(shippingRateId);

    if (transaction.test !== true) {
      return res.status(502).json({
        success: false,
        message:
          'Shippo did not confirm a test transaction. Check the Shippo dashboard.',
      });
    }

    if (
      transaction.status !== 'SUCCESS' ||
      !transaction.label_url
    ) {
      return res.status(502).json({
        success: false,
        message: 'Shippo could not create the test label.',
        transaction: {
          id: transaction.object_id || null,
          status: transaction.status || null,
          test: transaction.test,
          objectState: transaction.object_state || null,
          messages: transaction.messages || [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      testOnly: true,
      message: 'Shippo test label created successfully.',
      transaction: {
        id: transaction.object_id,
        status: transaction.status,
        test: transaction.test,
        labelUrl: transaction.label_url,
        trackingNumber: transaction.tracking_number || null,
        trackingUrl: transaction.tracking_url_provider || null,
      },
    });
  } catch (error) {
    console.error('[Shippo test label endpoint error]', {
      message: error.message,
      status: error.status,
      response: error.response || null,
    });

    next(error);
  }
};

// POST /api/dev-test-orders
// Creates a cancelled, unpaid test order. No inventory is deducted.
exports.createTestOrder = async (req, res, next) => {
  try {
    ensureDevTestingEnabled();

    const user = await User.findById(req.user._id).select('name email');

    if (!user || !user.email) {
      return res.status(400).json({
        success: false,
        message: 'A valid customer account and email are required.',
      });
    }

    const {
      items: requestedItems,
      shippingAddress,
    } = req.body || {};

    if (
      !Array.isArray(requestedItems) ||
      requestedItems.length < 1 ||
      requestedItems.length > 20
    ) {
      return res.status(400).json({
        success: false,
        message: 'Provide between 1 and 20 test order items.',
      });
    }

    const address = cleanTestAddress(shippingAddress);
    const items = [];
    let subtotalInCents = 0;

    for (const requested of requestedItems) {
      const sku = String(requested.sku || '').trim();
      const quantity = Number(requested.quantity);

      if (
        !sku ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      ) {
        return res.status(400).json({
          success: false,
          message: 'Each item needs a valid SKU and quantity from 1 to 10.',
        });
      }

      const product = await Product.findOne({
        'variants.sku': sku,
        active: true,
      });

      const variant = product?.variants?.find(
        (entry) => entry.sku === sku && entry.active
      );

      if (!product || !variant) {
        return res.status(400).json({
          success: false,
          message: `Active product variant not found: ${sku}`,
        });
      }

      const unitPriceInCents = Number(variant.priceInCents);

      if (
        !Number.isInteger(unitPriceInCents) ||
        unitPriceInCents < 0
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid price for test item: ${sku}`,
        });
      }

      const lineTotalInCents = unitPriceInCents * quantity;
      subtotalInCents += lineTotalInCents;

      items.push({
        product: product._id,
        name: product.name,
        slug: product.slug,
        imageUrl: product.imageUrl,
        sku,
        size: variant.size,
        quantity,
        unitPriceInCents,
        lineTotalInCents,
      });
    }

    // Fixed shipping policy, based on merchandise subtotal before discounts.
    const shippingInCents = subtotalInCents >= 10000 ? 0 : 599;
    const shippingProvider = 'Standard shipping';
    const shippingService =
      shippingInCents === 0
        ? 'Standard shipping (free)'
        : 'Standard shipping';

    const now = Date.now();
    const orderNumber = `TEST-NN-${now}`;

    const order = await Order.create({
      user: user._id,
      orderNumber,
      items,
      subtotalInCents,
      shippingInCents,
      discountInCents: 0,
      taxInCents: 0,
      totalInCents: subtotalInCents + shippingInCents,
      currency: 'usd',
      shippingAddress: address,
      stripeCheckoutSessionId: `DEV_TEST_${now}`,
      paymentStatus: 'pending',
      status: 'cancelled',
      testMode: true,
      shippingProvider,
      shippoRateId: '',
      emailStatus: 'pending',
      statusHistory: [
        {
          status: 'cancelled',
          note:
            'Development-only test order. No payment was taken; do not fulfil.',
        },
      ],
    });

    let emailResult = {
      sent: false,
      reason: 'not_attempted',
    };

    try {
      emailResult = await sendOrderConfirmation(order, user.email);

      order.emailStatus = emailResult.sent
        ? 'sent'
        : emailResult.reason === 'not_configured'
          ? 'not_configured'
          : 'failed';

      if (emailResult.sent) {
        order.emailSentAt = new Date();
      }

      await order.save();
    } catch (emailError) {
      console.error('Development test-order email failed:', {
        message: emailError.message,
        name: emailError.name,
        statusCode: emailError.statusCode,
      });

      emailResult = {
        sent: false,
        reason: 'failed',
        message: emailError.message || 'Email sending failed.',
      };

      order.emailStatus = 'failed';

      await order.save().catch((saveError) => {
        console.error(
          'Could not save test-order email status:',
          saveError.message
        );
      });
    }

    return res.status(201).json({
      success: true,
      testOnly: true,
      message:
        'Unpaid development test order created. It is cancelled and must not be fulfilled.',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        status: order.status,
        subtotalInCents: order.subtotalInCents,
        shippingInCents: order.shippingInCents,
        totalInCents: order.totalInCents,
        currency: order.currency,
        shippingProvider,
        shippingService,
        emailStatus: order.emailStatus,
        emailSent: Boolean(emailResult.sent),
        emailMessage: emailResult.sent
          ? 'Resend accepted the email request.'
          : emailResult.message ||
            (emailResult.reason === 'not_configured'
              ? 'Resend is not configured. Check RESEND_API_KEY and EMAIL_FROM.'
              : 'The order was created, but the email was not sent.'),
      },
    });
  } catch (error) {
    next(error);
  }
};
