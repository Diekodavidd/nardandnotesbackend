const mongoose = require("mongoose");

const storeSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "store",
      unique: true,
      immutable: true,
    },
    storeName: { type: String, default: "NARD & NOTES" },
    url: { type: String, default: "https://nardandnotes.com" },
    description: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    country: { type: String, default: "Nigeria (NG)" },
    processing: { type: String, default: "3-5" },
    internationalShipping: { type: Boolean, default: true },
    requirePhone: { type: Boolean, default: true },
    showEta: { type: Boolean, default: true },
    orderEmail: { type: Boolean, default: true },
    shippingEmail: { type: Boolean, default: true },
    marketingEmail: { type: Boolean, default: false },
    primary: { type: String, default: "#641C30" },
    secondary: { type: String, default: "#C9A87A" },
    background: { type: String, default: "#F9F3EA" },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.StoreSettings ||
  mongoose.model("StoreSettings", storeSettingsSchema);