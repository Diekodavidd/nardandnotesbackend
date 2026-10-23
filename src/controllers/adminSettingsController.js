const StoreSettings = require("../models/StoreSettings");

const DEFAULTS = {
  storeName: "NARD & NOTES",
  url: "https://nardandnotes.com",
  description:
    "Experiential perfumery for modern individuals. Exceptional fragrances that create lasting moments.",
  email: "support@nardandnotes.com",
  phone: "",
  address: "",
  country: "Nigeria (NG)",
  processing: "3-5",
  internationalShipping: true,
  requirePhone: true,
  showEta: true,
  orderEmail: true,
  shippingEmail: true,
  marketingEmail: false,
  primary: "#641C30",
  secondary: "#C9A87A",
  background: "#F9F3EA",
};

const BOOLEAN_FIELDS = [
  "internationalShipping",
  "requirePhone",
  "showEta",
  "orderEmail",
  "shippingEmail",
  "marketingEmail",
];

const TEXT_FIELDS = [
  "storeName",
  "url",
  "description",
  "email",
  "phone",
  "address",
  "country",
  "processing",
  "primary",
  "secondary",
  "background",
];

function sanitise(body = {}) {
  const update = {};

  for (const field of TEXT_FIELDS) {
    if (typeof body[field] === "string") {
      update[field] = body[field].trim();
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    if (typeof body[field] === "boolean") {
      update[field] = body[field];
    }
  }

  if (
    update.processing !== undefined &&
    !["1-2", "3-5", "5-7"].includes(update.processing)
  ) {
    throw Object.assign(new Error("Invalid processing time."), {
      status: 400,
    });
  }

  for (const field of ["primary", "secondary", "background"]) {
    if (
      update[field] !== undefined &&
      !/^#[0-9a-fA-F]{6}$/.test(update[field])
    ) {
      throw Object.assign(
        new Error(`Invalid ${field} colour.`),
        { status: 400 }
      );
    }
  }

  if (update.url && !/^https?:\/\/.+/i.test(update.url)) {
    throw Object.assign(new Error("Enter a valid website URL."), {
      status: 400,
    });
  }

  if (
    update.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email)
  ) {
    throw Object.assign(new Error("Enter a valid email address."), {
      status: 400,
    });
  }

  return update;
}

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await StoreSettings.findOneAndUpdate(
      { key: "store" },
      { $setOnInsert: { key: "store", ...DEFAULTS } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const update = sanitise(req.body);

    const settings = await StoreSettings.findOneAndUpdate(
      { key: "store" },
      {
        $setOnInsert: { key: "store", ...DEFAULTS },
        $set: update,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
};