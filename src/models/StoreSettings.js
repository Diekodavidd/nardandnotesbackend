
const mongoose = require("mongoose");

const storeSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "store",
      unique: true,
      immutable: true,
      required: true,
    },

    // General
    currency: {
      type: String,
      enum: ["USD", "EUR", "GBP", "CAD"],
      default: "USD",
    },
    timezone: {
      type: String,
      default: "America/New_York",
      trim: true,
    },
    language: {
      type: String,
      enum: ["en-US", "en-GB"],
      default: "en-US",
    },
    storeStatus: {
      type: String,
      enum: ["open", "paused"],
      default: "open",
    },
    checkoutNote: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    // Store details
    storeName: {
      type: String,
      default: "NARD & NOTES",
      trim: true,
      maxlength: 120,
    },
    url: {
      type: String,
      default: "https://nardandnotes.com",
      trim: true,
    },
    description: {
      type: String,
      default:
        "Experiential perfumery for modern individuals. Exceptional fragrances that create lasting moments.",
      maxlength: 2000,
    },
    email: {
      type: String,
      default: "info@nardandnotes.com",
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    country: {
      type: String,
      default: "United States (US)",
      trim: true,
    },

    // Shipping
    processing: {
      type: String,
      enum: ["1-2", "3-5", "5-7"],
      default: "3-5",
    },
    internationalShipping: {
      type: Boolean,
      default: true,
    },
    requirePhone: {
      type: Boolean,
      default: true,
    },
    showEta: {
      type: Boolean,
      default: true,
    },
    shippingHandlingDays: {
      type: String,
      default: "0",
    },
    freeShippingThreshold: {
      type: String,
      default: "100",
    },
    shippingPolicyUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // Payment preferences (not provider credentials)
    stripeEnabled: {
      type: Boolean,
      default: true,
    },
    paystackEnabled: {
      type: Boolean,
      default: false,
    },
    paypalEnabled: {
      type: Boolean,
      default: false,
    },
    cashOnDelivery: {
      type: Boolean,
      default: false,
    },
    paymentTestMode: {
      type: Boolean,
      default: true,
    },

    // Emails
    senderName: {
      type: String,
      default: "NARD & NOTES",
      trim: true,
    },
    senderEmail: {
      type: String,
      default: "info@nardandnotes.com",
      trim: true,
      lowercase: true,
    },
    replyToEmail: {
      type: String,
      default: "info@nardandnotes.com",
      trim: true,
      lowercase: true,
    },
    orderEmailSubject: {
      type: String,
      default: "We've received your order",
      maxlength: 200,
    },
    shippingEmailSubject: {
      type: String,
      default: "Your order is on its way",
      maxlength: 200,
    },
    orderEmail: {
      type: Boolean,
      default: true,
    },
    shippingEmail: {
      type: Boolean,
      default: true,
    },
    marketingEmail: {
      type: Boolean,
      default: false,
    },

    // Appearance
    primary: {
      type: String,
      default: "#641C30",
    },
    secondary: {
      type: String,
      default: "#C9A87A",
    },
    background: {
      type: String,
      default: "#F9F3EA",
    },
    primaryFont: {
      type: String,
      enum: [
        "Cormorant Garamond",
        "Georgia",
        "Arial",
        "Helvetica",
      ],
      default: "Cormorant Garamond",
    },
    showAnnouncement: {
      type: Boolean,
      default: false,
    },
    announcementText: {
      type: String,
      default: "",
      maxlength: 500,
    },

    // Team & Access / operational preferences
    allowAccountRegistration: {
      type: Boolean,
      default: true,
    },
    guestCheckout: {
      type: Boolean,
      default: true,
    },

    // Notifications
    lowStockNotifications: {
      type: Boolean,
      default: true,
    },
    newOrderNotifications: {
      type: Boolean,
      default: true,
    },
    failedPaymentNotifications: {
      type: Boolean,
      default: true,
    },
    dailySummary: {
      type: Boolean,
      default: false,
    },

    // Advanced
    taxEnabled: {
      type: Boolean,
      default: false,
    },
    taxInclusive: {
      type: Boolean,
      default: false,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    maxLoginAttempts: {
      type: String,
      enum: ["3", "5", "10"],
      default: "5",
    },
    sessionTimeout: {
      type: String,
      enum: ["15", "30", "60", "120"],
      default: "60",
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

module.exports =
  mongoose.models.StoreSettings ||
  mongoose.model("StoreSettings", storeSettingsSchema);
