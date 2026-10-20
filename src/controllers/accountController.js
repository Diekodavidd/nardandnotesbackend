const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');

const Order = require('../models/Order');


function safeUser(user) {
  if (!user) return null;

  return {
    id: user._id,
    name: user.name,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    username: user.username || "",
    email: user.email,
    phone: user.phone || "",
    dateOfBirth: user.dateOfBirth || null,
    gender: user.gender || "",
    avatarUrl: user.avatarUrl || "",
    preferences: user.preferences || {},
    addresses: user.addresses || [],
    wishlist: user.wishlist || [],
    savedCards: (user.savedCards || []).map((card) => ({
      id: card.stripePaymentMethodId,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      isDefault: card.isDefault,
    })),
    createdAt: user.createdAt,
  };
}


exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    res.json({ success: true, user: safeUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const body = req.body || {};

    // Accept either a full name or first/last name fields.
    const firstName =
      body.firstName !== undefined
        ? String(body.firstName).trim()
        : user.firstName || "";

    const lastName =
      body.lastName !== undefined
        ? String(body.lastName).trim()
        : user.lastName || "";

    let name = body.name !== undefined
      ? String(body.name).trim()
      : `${firstName} ${lastName}`.trim();

    if (body.firstName !== undefined || body.lastName !== undefined) {
      name = `${firstName} ${lastName}`.trim();
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Your full name must be between 2 and 100 characters.",
      });
    }

    if (body.firstName !== undefined && firstName.length > 60) {
      return res.status(400).json({
        success: false,
        message: "First name cannot exceed 60 characters.",
      });
    }

    if (body.lastName !== undefined && lastName.length > 60) {
      return res.status(400).json({
        success: false,
        message: "Last name cannot exceed 60 characters.",
      });
    }

    user.name = name;

    if (body.firstName !== undefined) user.firstName = firstName;
    if (body.lastName !== undefined) user.lastName = lastName;

    if (body.username !== undefined) {
      const username = String(body.username).trim().toLowerCase();

      if (username && !/^[a-z0-9._-]{3,30}$/.test(username)) {
        return res.status(400).json({
          success: false,
          message:
            "Username must be 3–30 characters and use only letters, numbers, dots, underscores, or hyphens.",
        });
      }

      if (username) {
        const existingUser = await User.findOne({
          username,
          _id: { $ne: user._id },
        }).select("_id");

        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "That username is already taken.",
          });
        }

        user.username = username;
      } else {
        user.username = undefined;
      }
    }

    if (body.phone !== undefined) {
      const phone = String(body.phone).trim();

      if (phone.length > 30) {
        return res.status(400).json({
          success: false,
          message: "Phone number cannot exceed 30 characters.",
        });
      }

      user.phone = phone;
    }

    if (body.gender !== undefined) {
      const allowedGenders = [
        "",
        "female",
        "male",
        "non_binary",
        "prefer_not_to_say",
      ];

      if (!allowedGenders.includes(body.gender)) {
        return res.status(400).json({
          success: false,
          message: "Invalid gender selection.",
        });
      }

      user.gender = body.gender;
    }

    if (body.dateOfBirth !== undefined) {
      if (body.dateOfBirth === null || body.dateOfBirth === "") {
        user.dateOfBirth = null;
      } else {
        const dob = new Date(body.dateOfBirth);

        if (
          Number.isNaN(dob.getTime()) ||
          dob.getTime() > Date.now()
        ) {
          return res.status(400).json({
            success: false,
            message: "Enter a valid date of birth.",
          });
        }

        user.dateOfBirth = dob;
      }
    }

    if (body.avatarUrl !== undefined) {
      const avatarUrl = String(body.avatarUrl).trim();

      if (avatarUrl.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Profile image URL is too long.",
        });
      }

      user.avatarUrl = avatarUrl;
    }

    if (body.preferences !== undefined) {
      if (
        !body.preferences ||
        typeof body.preferences !== "object" ||
        Array.isArray(body.preferences)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid preferences.",
        });
      }

      const input = body.preferences;
      const allowedCurrencies = ["USD", "NGN", "GBP", "EUR"];
      const allowedInterests = [
        "For Her",
        "For Him",
        "Unisex",
        "Woody",
        "Floral",
        "Fresh",
        "Oriental",
      ];

      if (input.marketingEmails !== undefined) {
        if (typeof input.marketingEmails !== "boolean") {
          return res.status(400).json({
            success: false,
            message: "Marketing email preference must be true or false.",
          });
        }

        user.preferences.marketingEmails = input.marketingEmails;
      }

      if (input.orderUpdates !== undefined) {
        if (typeof input.orderUpdates !== "boolean") {
          return res.status(400).json({
            success: false,
            message: "Order update preference must be true or false.",
          });
        }

        user.preferences.orderUpdates = input.orderUpdates;
      }

      if (input.preferredCurrency !== undefined) {
        if (!allowedCurrencies.includes(input.preferredCurrency)) {
          return res.status(400).json({
            success: false,
            message: "Unsupported preferred currency.",
          });
        }

        user.preferences.preferredCurrency = input.preferredCurrency;
      }

      if (input.fragranceInterests !== undefined) {
        if (
          !Array.isArray(input.fragranceInterests) ||
          !input.fragranceInterests.every((item) =>
            allowedInterests.includes(item)
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "One or more fragrance interests are invalid.",
          });
        }

        user.preferences.fragranceInterests = [
          ...new Set(input.fragranceInterests),
        ];
      }
    }

    await user.save();

    res.json({
      success: true,
      message: "Your profile has been updated.",
      user: safeUser(user),
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.username) {
      return res.status(409).json({
        success: false,
        message: "That username is already taken.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Some profile details are invalid.",
      });
    }

    next(error);
  }
};


exports.getOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const orders = await Order.find({ user: userId })
      .select(
  "orderNumber items subtotalInCents shippingInCents " +
  "discountInCents taxInCents totalInCents currency status " +
  "paymentStatus shippingAddress trackingNumber trackingUrl " +
  "createdAt updatedAt " +
  "stripeCheckoutSessionId testMode emailStatus emailSentAt " +
"shippingProvider shippedAt deliveredAt statusHistory"
)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      orders: orders.map((order) => ({
  id: order._id,
  orderNumber: order.orderNumber,
  items: order.items || [],
  subtotalInCents: order.subtotalInCents,
  shippingInCents: order.shippingInCents,
  discountInCents: order.discountInCents,
  taxInCents: order.taxInCents,
  totalInCents: order.totalInCents,
  currency: order.currency || "usd",
  status: order.status,
  paymentStatus: order.paymentStatus,
  shippingAddress: order.shippingAddress,
  trackingNumber: order.trackingNumber,
  stripeCheckoutSessionId: order.stripeCheckoutSessionId,
testMode: order.testMode,
emailStatus: order.emailStatus,
emailSentAt: order.emailSentAt,
shippingProvider: order.shippingProvider,
shippedAt: order.shippedAt,
deliveredAt: order.deliveredAt,
statusHistory: order.statusHistory || [],
  trackingUrl: order.trackingUrl,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
})),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/account/orders/:orderId
 * Return one order belonging to the authenticated customer.
 */
exports.getOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!/^[a-f\d]{24}$/i.test(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID.',
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    })
     .select(
  "orderNumber items subtotalInCents shippingInCents " +
  "discountInCents taxInCents totalInCents currency status " +
  "paymentStatus shippingAddress trackingNumber trackingUrl " +
  "createdAt updatedAt " +
  "stripeCheckoutSessionId testMode emailStatus emailSentAt " +
"shippingProvider shippedAt deliveredAt statusHistory"
)
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    res.status(200).json({
      success: true,
      order: {
  id: order._id,
  orderNumber: order.orderNumber,
  items: order.items || [],
  subtotalInCents: order.subtotalInCents,
  shippingInCents: order.shippingInCents,
  discountInCents: order.discountInCents,
  taxInCents: order.taxInCents,
  totalInCents: order.totalInCents,
  currency: order.currency || "usd",
  status: order.status,
  stripeCheckoutSessionId: order.stripeCheckoutSessionId,
testMode: order.testMode,
emailStatus: order.emailStatus,
emailSentAt: order.emailSentAt,
shippingProvider: order.shippingProvider,
shippedAt: order.shippedAt,
deliveredAt: order.deliveredAt,
statusHistory: order.statusHistory || [],
  paymentStatus: order.paymentStatus,
  shippingAddress: order.shippingAddress,
  trackingNumber: order.trackingNumber,
  trackingUrl: order.trackingUrl,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
},
    });
  } catch (error) {
    next(error);
  }
};
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 72) {
      return res.status(400).json({ success: false, message: 'New password must be between 10 and 72 characters.' });
    }
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ success: true, message: 'Password updated. Please sign in again on other devices.' });
  } catch (error) { next(error); }
};



function cleanAddress(body = {}) {
  const fields = [
    "label",
    "recipientName",
    "phone",
    "line1",
    "line2",
    "city",
    "state",
    "postalCode",
  ];

  const address = {};

  for (const key of fields) {
    address[key] = String(body[key] || "").trim();
  }

  const country = String(body.country || "US")
    .trim()
    .toUpperCase();

  if (country !== "US") {
    throw Object.assign(
      new Error("NARD & NOTES currently delivers only within the United States."),
      { status: 400 }
    );
  }

  address.country = "US";
  address.isDefault = Boolean(body.isDefault);

  if (
    !address.recipientName ||
    !address.phone ||
    !address.line1 ||
    !address.city ||
    !address.state ||
    !address.postalCode
  ) {
    throw Object.assign(
      new Error("Complete all required shipping address fields."),
      { status: 400 }
    );
  }

  if (
    address.label.length > 40 ||
    address.recipientName.length > 100 ||
    address.phone.length > 30 ||
    address.line1.length > 150 ||
    address.line2.length > 150 ||
    address.city.length > 100 ||
    address.state.length > 100 ||
    address.postalCode.length > 20
  ) {
    throw Object.assign(
      new Error("One or more address fields exceed the allowed length."),
      { status: 400 }
    );
  }

  return address;
}



exports.listAddresses = async (req, res, next) => {
  try { const user = await User.findById(req.user._id).select('addresses'); res.json({ success: true, addresses: user.addresses || [] }); }
  catch (error) { next(error); }
};

exports.createAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const address = cleanAddress(req.body);
    if (!user.addresses) user.addresses = [];
    if (address.isDefault || user.addresses.length === 0) user.addresses.forEach((item) => { item.isDefault = false; });
    if (user.addresses.length >= 10) return res.status(400).json({ success: false, message: 'You can save up to 10 addresses.' });
    user.addresses.push(address);
    await user.save();
    res.status(201).json({ success: true, addresses: user.addresses });
  } catch (error) { next(error); }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found.' });
    const clean = cleanAddress(req.body);
    if (clean.isDefault) user.addresses.forEach((item) => { item.isDefault = false; });
    Object.assign(address, clean);
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (error) { next(error); }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found.' });
    const wasDefault = address.isDefault;
    address.deleteOne();
    if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (error) { next(error); }
};

exports.listWishlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('wishlist');
    const ids = (user.wishlist || []).map(String);
    const products = await Product.find({ _id: { $in: ids }, active: true }).select('name slug imageUrl type tagline variants categories');
    res.json({ success: true, products });
  } catch (error) { next(error); }
};

exports.addWishlist = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.productId, active: true }).select('_id');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    await User.updateOne({ _id: req.user._id }, { $addToSet: { wishlist: product._id } });
    res.json({ success: true, message: 'Added to wishlist.' });
  } catch (error) { next(error); }
};

exports.removeWishlist = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $pull: { wishlist: req.params.productId } });
    res.json({ success: true, message: 'Removed from wishlist.' });
  } catch (error) { next(error); }
};
