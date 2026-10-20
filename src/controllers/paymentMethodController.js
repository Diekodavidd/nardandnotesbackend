
const stripe = require("../services/stripe");
const User = require("../models/User");

async function getOrCreateStripeCustomer(user) {
  if (user.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);

      if (!customer.deleted) {
        return customer;
      }
    } catch (error) {
      if (error.code !== "resource_missing") {
        throw error;
      }
    }

    user.stripeCustomerId = null;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: String(user._id),
      app: "nard-and-notes",
    },
  });

  user.stripeCustomerId = customer.id;
  await user.save();

  return customer;
}

function publicCard(paymentMethod, defaultPaymentMethodId) {
  const card = paymentMethod.card || {};

  return {
    id: paymentMethod.id,
    brand: card.brand || "card",
    last4: card.last4 || "",
    expMonth: card.exp_month || null,
    expYear: card.exp_year || null,
    funding: card.funding || "",
    isDefault: paymentMethod.id === defaultPaymentMethodId,
  };
}

// POST /api/account/payment-methods/setup
exports.createSetupIntent = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const customer = await getOrCreateStripeCustomer(user);

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      metadata: {
        userId: String(user._id),
        purpose: "save_customer_card",
      },
    });

    res.status(201).json({
      success: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/account/payment-methods
exports.listPaymentMethods = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    // A customer without a Stripe record has no saved Stripe cards.
    if (!user.stripeCustomerId) {
      return res.json({
        success: true,
        paymentMethods: [],
        defaultPaymentMethodId: null,
      });
    }

    const customer = await stripe.customers.retrieve(user.stripeCustomerId);

    if (customer.deleted) {
      user.stripeCustomerId = null;
      await user.save();

      return res.json({
        success: true,
        paymentMethods: [],
        defaultPaymentMethodId: null,
      });
    }

    const [methods, refreshedCustomer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: customer.id,
        type: "card",
        limit: 100,
      }),
      stripe.customers.retrieve(customer.id),
    ]);

    const defaultPaymentMethodId =
      !refreshedCustomer.deleted &&
      refreshedCustomer.invoice_settings?.default_payment_method
        ? String(refreshedCustomer.invoice_settings.default_payment_method)
        : null;

    res.json({
      success: true,
      paymentMethods: methods.data.map((method) =>
        publicCard(method, defaultPaymentMethodId)
      ),
      defaultPaymentMethodId,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/account/payment-methods/:id/default
exports.setDefaultPaymentMethod = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({
        success: false,
        message: "No payment methods are available for this account.",
      });
    }

    const paymentMethodId = String(req.params.id || "");

    if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method ID.",
      });
    }

    // Confirm the method is attached to this exact customer.
    const paymentMethod = await stripe.paymentMethods.retrieve(
      paymentMethodId
    );

    if (
      paymentMethod.customer !== user.stripeCustomerId ||
      paymentMethod.type !== "card"
    ) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found for this account.",
      });
    }

    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });

    res.json({
      success: true,
      message: "Default payment method updated.",
      defaultPaymentMethodId: paymentMethod.id,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/account/payment-methods/:id
exports.removePaymentMethod = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found.",
      });
    }

    const paymentMethodId = String(req.params.id || "");

    if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method ID.",
      });
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(
      paymentMethodId
    );

    if (
      paymentMethod.customer !== user.stripeCustomerId ||
      paymentMethod.type !== "card"
    ) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found for this account.",
      });
    }

    const customer = await stripe.customers.retrieve(user.stripeCustomerId);

    const currentDefault =
      !customer.deleted &&
      customer.invoice_settings?.default_payment_method
        ? String(customer.invoice_settings.default_payment_method)
        : null;

    // If removing the default card, select another saved card first.
    if (currentDefault === paymentMethodId) {
      const remaining = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
        limit: 100,
      });

      const replacement = remaining.data.find(
        (method) => method.id !== paymentMethodId
      );

      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: replacement ? replacement.id : "",
        },
      });
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    res.json({
      success: true,
      message: "Payment method removed.",
    });
  } catch (error) {
    next(error);
  }
};
