
const StoreSettings = require("../models/StoreSettings");

const DEFAULTS = {
  currency: "USD",
  timezone: "America/New_York",
  language: "en-US",
  storeStatus: "open",
  checkoutNote: "",

  storeName: "NARD & NOTES",
  url: "https://nardandnotes.com",
  description:
    "Experiential perfumery for modern individuals. Exceptional fragrances that create lasting moments.",
  email: "support@nardandnotes.com",
  phone: "",
  address: "",
  country: "United States (US)",

  processing: "3-5",
  internationalShipping: true,
  requirePhone: true,
  showEta: true,
  shippingHandlingDays: "0",
  freeShippingThreshold: "100",
  shippingPolicyUrl: "",

  stripeEnabled: true,
  paystackEnabled: false,
  paypalEnabled: false,
  cashOnDelivery: false,
  paymentTestMode: true,

  senderName: "NARD & NOTES",
  senderEmail: "support@nardandnotes.com",
  replyToEmail: "support@nardandnotes.com",
  orderEmailSubject: "We've received your order",
  shippingEmailSubject: "Your order is on its way",
  orderEmail: true,
  shippingEmail: true,
  marketingEmail: false,

  primary: "#641C30",
  secondary: "#C9A87A",
  background: "#F9F3EA",
  primaryFont: "Cormorant Garamond",
  showAnnouncement: false,
  announcementText: "",

  allowAccountRegistration: true,
  guestCheckout: true,

  lowStockNotifications: true,
  newOrderNotifications: true,
  failedPaymentNotifications: true,
  dailySummary: false,

  taxEnabled: false,
  taxInclusive: false,
  maintenanceMode: false,
  maxLoginAttempts: "5",
  sessionTimeout: "60",
};

const BOOLEAN_FIELDS = [
  "internationalShipping",
  "requirePhone",
  "showEta",
  "stripeEnabled",
  "paystackEnabled",
  "paypalEnabled",
  "cashOnDelivery",
  "paymentTestMode",
  "orderEmail",
  "shippingEmail",
  "marketingEmail",
  "showAnnouncement",
  "allowAccountRegistration",
  "guestCheckout",
  "lowStockNotifications",
  "newOrderNotifications",
  "failedPaymentNotifications",
  "dailySummary",
  "taxEnabled",
  "taxInclusive",
  "maintenanceMode",
];

const STRING_FIELDS = [
  "currency",
  "timezone",
  "language",
  "storeStatus",
  "checkoutNote",
  "storeName",
  "url",
  "description",
  "email",
  "phone",
  "address",
  "country",
  "processing",
  "shippingHandlingDays",
  "freeShippingThreshold",
  "shippingPolicyUrl",
  "senderName",
  "senderEmail",
  "replyToEmail",
  "orderEmailSubject",
  "shippingEmailSubject",
  "primary",
  "secondary",
  "background",
  "primaryFont",
  "announcementText",
  "maxLoginAttempts",
  "sessionTimeout",
];

const EMAIL_FIELDS = [
  "email",
  "senderEmail",
  "replyToEmail",
];

const URL_FIELDS = [
  "url",
  "shippingPolicyUrl",
];

const COLOUR_FIELDS = [
  "primary",
  "secondary",
  "background",
];

const ENUMS = {
  currency: ["USD", "EUR", "GBP", "CAD"],
  language: ["en-US", "en-GB"],
  storeStatus: ["open", "paused"],
  processing: ["1-2", "3-5", "5-7"],
  primaryFont: [
    "Cormorant Garamond",
    "Georgia",
    "Arial",
    "Helvetica",
  ],
  maxLoginAttempts: ["3", "5", "10"],
  sessionTimeout: ["15", "30", "60", "120"],
};

const MAX_LENGTHS = {
  storeName: 120,
  description: 2000,
  checkoutNote: 1000,
  address: 1000,
  announcementText: 500,
  orderEmailSubject: 200,
  shippingEmailSubject: 200,
  senderName: 120,
  country: 120,
  timezone: 100,
  phone: 50,
};

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function sanitise(body = {}) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw badRequest("Settings payload must be an object.");
  }

  const update = {};

  for (const field of STRING_FIELDS) {
    if (body[field] === undefined) continue;

    if (typeof body[field] !== "string") {
      throw badRequest(`${field} must be a string.`);
    }

    update[field] = body[field].trim();
  }

  for (const field of BOOLEAN_FIELDS) {
    if (body[field] === undefined) continue;

    if (typeof body[field] !== "boolean") {
      throw badRequest(`${field} must be true or false.`);
    }

    update[field] = body[field];
  }

  for (const [field, allowedValues] of Object.entries(ENUMS)) {
    if (
      update[field] !== undefined &&
      !allowedValues.includes(update[field])
    ) {
      throw badRequest(`Invalid value for ${field}.`);
    }
  }

  for (const [field, maxLength] of Object.entries(MAX_LENGTHS)) {
    if (
      update[field] !== undefined &&
      update[field].length > maxLength
    ) {
      throw badRequest(
        `${field} must not exceed ${maxLength} characters.`
      );
    }
  }

  if (
    update.storeName !== undefined &&
    !update.storeName
  ) {
    throw badRequest("Store name is required.");
  }

  for (const field of EMAIL_FIELDS) {
    if (
      update[field] !== undefined &&
      update[field] !== "" &&
      !isValidEmail(update[field])
    ) {
      throw badRequest(`Enter a valid ${field} address.`);
    }
  }

  for (const field of URL_FIELDS) {
    if (
      update[field] !== undefined &&
      update[field] !== "" &&
      !isValidHttpUrl(update[field])
    ) {
      throw badRequest(`Enter a valid URL for ${field}.`);
    }
  }

  for (const field of COLOUR_FIELDS) {
    if (
      update[field] !== undefined &&
      !/^#[0-9a-fA-F]{6}$/.test(update[field])
    ) {
      throw badRequest(`Invalid ${field} colour.`);
    }

    if (update[field] !== undefined) {
      update[field] = update[field].toUpperCase();
    }
  }

  for (const field of [
    "shippingHandlingDays",
    "freeShippingThreshold",
  ]) {
    if (update[field] === undefined) continue;

    if (
      update[field] === "" ||
      !/^\d+(\.\d{1,2})?$/.test(update[field])
    ) {
      throw badRequest(`${field} must be a valid non-negative number.`);
    }

    const number = Number(update[field]);

    if (!Number.isFinite(number) || number < 0) {
      throw badRequest(`${field} must be a valid non-negative number.`);
    }
  }

  return update;
}

async function ensureSettings() {
  let settings = await StoreSettings.findOne({ key: "store" });

  if (!settings) {
    try {
      settings = await StoreSettings.create({
        key: "store",
        ...DEFAULTS,
      });
    } catch (error) {
      // Handles two first-time requests attempting to create
      // the singleton document at the same time.
      if (error.code !== 11000) throw error;
      settings = await StoreSettings.findOne({ key: "store" });
    }
  }

  if (!settings) {
    throw new Error("Unable to initialise store settings.");
  }

  // Backfill missing fields on older documents while preserving
  // values the administrator has already saved.
  let changed = false;

  for (const [field, value] of Object.entries(DEFAULTS)) {
    if (
      settings.get(field) === undefined ||
      settings.get(field) === null
    ) {
      settings.set(field, value);
      changed = true;
    }
  }

  if (changed) {
    await settings.save();
  }

  return settings;
}

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await ensureSettings();

    return res.json({
      success: true,
      settings: settings.toObject(),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const update = sanitise(req.body);
    const settings = await ensureSettings();

    for (const [field, value] of Object.entries(update)) {
      settings.set(field, value);
    }

    await settings.save();

    return res.json({
      success: true,
      message: "Store settings updated successfully.",
      settings: settings.toObject(),
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};
