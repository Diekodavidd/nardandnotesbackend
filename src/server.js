
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const connectDatabase = require("./config/database");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const accountRoutes = require("./routes/accountRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const shippingRoutes = require("./routes/shippingRoutes");
const promoRoutes = require("./routes/promoRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const adminOrderRoutes = require("./routes/adminOrderRoutes");
const adminPromoRoutes = require("./routes/adminPromoRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminInventoryRoutes = require("./routes/adminInventoryRoutes");
const stripeWebhookController = require("./controllers/stripeWebhookController");
const adminProductRoutes = require("./routes/adminProductRoutes");
const adminSettingsRoutes = require("./routes/adminSettingsRoutes");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet());

const allowedOrigins = [
  "https://nardandnotes.com",
  "https://www.nardandnotes.com",
  "http://localhost:3000",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header, such as server-to-server calls.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-admin-api-key",
    ],
    optionsSuccessStatus: 204,
  })
);

// Stripe requires the raw request body for signature verification.
// Keep this route before express.json().

app.post(
  "/api/checkout/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookController.handleStripeWebhook
);

app.use(express.json({ limit: "100kb" }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "NARD & NOTES API is running.",
  });
});

app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/promos", promoRoutes);
app.use("/api/account/cart", cartRoutes);

// Admin routes
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/promos", adminPromoRoutes);
app.use("/api/admin/inventory", adminInventoryRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);

// API 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("API error:", error.message);

  const status =
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status < 600
      ? error.status
      : 500;

  res.status(status).json({
    success: false,
    message:
      status === 500
        ? "An unexpected server error occurred."
        : error.message,
  });
});

async function startServer() {
  try {
    await connectDatabase();

    const port = process.env.PORT || 5000;

    app.listen(port, () => {
      console.log(`API running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start API:", error.message);
    process.exit(1);
  }
}

startServer();
