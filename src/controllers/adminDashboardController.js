
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const Product = require("../models/Product");

const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function parseDate(value, fallback) {
  if (!value) return fallback;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 25)
  );

  return { page, limit, skip: (page - 1) * limit };
}

// GET /api/admin/overview
exports.overview = async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const [
      totalOrders,
      paidOrders,
      awaitingFulfilment,
      processingOrders,
      shippedThisMonth,
      recentOrders,
      fulfilmentCounts,
      revenueResult,
      topProducts,
    ] = await Promise.all([
      Order.countDocuments(),

      Order.countDocuments({ paymentStatus: "paid" }),

      Order.countDocuments({
        paymentStatus: "paid",
        status: "pending",
        testMode: { $ne: true },
      }),

      Order.countDocuments({
        paymentStatus: "paid",
        status: "processing",
        testMode: { $ne: true },
      }),

      Order.countDocuments({
        status: "shipped",
        shippedAt: { $gte: monthStart },
        testMode: { $ne: true },
      }),

      Order.find({ testMode: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name email")
        .lean(),

      Order.aggregate([
        { $match: { testMode: { $ne: true } } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      Order.aggregate([
        {
          $match: {
            paymentStatus: "paid",
            testMode: { $ne: true },
          },
        },
        {
          $group: {
            _id: "$currency",
            revenueInCents: { $sum: "$totalInCents" },
          },
        },
      ]),

      Order.aggregate([
        {
          $match: {
            paymentStatus: "paid",
            testMode: { $ne: true },
          },
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              sku: "$items.sku",
              name: "$items.name",
              size: "$items.size",
            },
            quantitySold: { $sum: "$items.quantity" },
            revenueInCents: { $sum: "$items.lineTotalInCents" },
          },
        },
        { $sort: { quantitySold: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const statusCounts = Object.fromEntries(
      fulfilmentCounts.map((item) => [item._id, item.count])
    );

    return res.json({
      success: true,
      stats: {
        totalOrders,
        paidOrders,
        awaitingFulfilment,
        processingOrders,
        shippedThisMonth,
      },
      revenueByCurrency: revenueResult,
      recentOrders,
      fulfilment: {
        pending: statusCounts.pending || 0,
        processing: statusCounts.processing || 0,
        shipped: statusCounts.shipped || 0,
        delivered: statusCounts.delivered || 0,
        cancelled: statusCounts.cancelled || 0,
      },
      topProducts,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/customers
exports.listCustomers = async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const search = String(req.query.search || "").trim();

    const filter = {};

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      filter.$or = [
        { name: regex },
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { username: regex },
        { phone: regex },
      ];
    }

    const [customers, total] = await Promise.all([
      User.find(filter)
        .select("name firstName lastName email phone avatarUrl createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments(filter),
    ]);

    const customerIds = customers.map((customer) => customer._id);

    const summaries = await Order.aggregate([
      {
        $match: {
          user: { $in: customerIds },
          testMode: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$user",
          orderCount: { $sum: 1 },
          paidOrderCount: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0],
            },
          },
          paidTotals: {
            $push: {
              $cond: [
                { $eq: ["$paymentStatus", "paid"] },
                { currency: "$currency", total: "$totalInCents" },
                null,
              ],
            },
          },
          lastOrderAt: { $max: "$createdAt" },
        },
      },
    ]);

    const summaryById = new Map(
      summaries.map((item) => [String(item._id), item])
    );

    const result = customers.map((customer) => {
      const summary = summaryById.get(String(customer._id));

      return {
        ...customer,
        orderCount: summary?.orderCount || 0,
        paidOrderCount: summary?.paidOrderCount || 0,
        paidTotals: (summary?.paidTotals || []).filter(Boolean),
        lastOrderAt: summary?.lastOrderAt || null,
      };
    });

    return res.json({
      success: true,
      customers: result,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/customers/:id
exports.customerDetails = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const customer = await User.findById(req.params.id)
      .select("-passwordHash -savedCards -stripeCustomerId -cart")
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    const orders = await Order.find({
      user: customer._id,
      testMode: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const paidTotalsByCurrency = {};

    for (const order of orders) {
      if (order.paymentStatus !== "paid") continue;

      const currency = String(order.currency || "usd").toUpperCase();
      paidTotalsByCurrency[currency] =
        (paidTotalsByCurrency[currency] || 0) +
        Number(order.totalInCents || 0);
    }

    return res.json({
      success: true,
      customer,
      orders,
      orderCount: orders.length,
      paidTotalsByCurrency,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/fulfilment
exports.fulfilmentQueue = async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const status = String(req.query.status || "").toLowerCase();

    const allowedStatuses = ["pending", "processing", "shipped", "delivered"];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid fulfilment status.",
      });
    }

    const filter = {
      paymentStatus: "paid",
      testMode: { $ne: true },
      status: status
        ? status
        : { $in: ["pending", "processing", "shipped", "delivered"] },
    };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Order.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      orders,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/fulfilment/:orderId/status
// Body: { "status": "processing" }
exports.updateFulfilmentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const status = String(req.body?.status || "").toLowerCase();
    const note = String(req.body?.note || "").trim().slice(0, 500);

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status.",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (order.testMode) {
      return res.status(409).json({
        success: false,
        message: "Test orders cannot be fulfilled.",
      });
    }

    if (order.paymentStatus !== "paid" && status !== "cancelled") {
      return res.status(409).json({
        success: false,
        message: "Only paid orders can enter fulfilment.",
      });
    }

    if (order.status === "cancelled" || order.status === "delivered") {
      return res.status(409).json({
        success: false,
        message: "This order is already in a terminal status.",
      });
    }

    if (status === "shipped" && !order.shippoTransactionId) {
      return res.status(409).json({
        success: false,
        message: "Purchase the shipping label before marking this order shipped.",
      });
    }

    if (status === "delivered" && order.status !== "shipped") {
      return res.status(409).json({
        success: false,
        message: "Only shipped orders can be marked delivered.",
      });
    }

    const previousStatus = order.status;

    if (previousStatus === status) {
      return res.json({ success: true, order });
    }

    order.status = status;

    if (status === "shipped") order.shippedAt = new Date();
    if (status === "delivered") order.deliveredAt = new Date();
    if (status === "cancelled") order.cancelledAt = new Date();

    order.statusHistory.push({
      status,
      note: note || `Status changed from ${previousStatus} to ${status}.`,
      changedAt: new Date(),
    });

    await order.save();

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/inventory


exports.inventoryOverview = async (req, res, next) => {
  try {
    const products = await Product.find({})
      .select(
        "name slug type imageUrl variants trackInventory updatedAt active"
      )
      .lean();

    const inventory = products.flatMap((product) =>
      (product.variants || []).map((variant) => {
        const stock = Number(variant.stock ?? 0);
        const threshold = 10;

        return {
          _id: `${product._id}-${variant.sku}`,
          productId: product._id,
          name: product.name,
          slug: product.slug,
          type: product.type,
          image: product.imageUrl || "",
          sku: variant.sku,
          size: variant.size || "",
          priceInCents: Number(variant.priceInCents ?? 0),
          currency: "USD",
          stock,
          lowStockThreshold: threshold,
          trackInventory: product.trackInventory !== false,
          active: product.active !== false && variant.active !== false,
          updatedAt: product.updatedAt || null,
          stockStatus:
            stock <= 0
              ? "out_of_stock"
              : stock <= threshold
                ? "low_stock"
                : "in_stock",
        };
      })
    );

    return res.status(200).json({
      success: true,
      inventory,
      items: inventory,
      summary: {
        variantCount: inventory.length,
        inStockCount: inventory.filter((item) => item.stock > threshold).length,
        lowStockCount: inventory.filter(
          (item) => item.stock > 0 && item.stock <= 10
        ).length,
        outOfStockCount: inventory.filter((item) => item.stock <= 0).length,
      },
    });
  } catch (error) {
    next(error);
  }
};


// GET /api/admin/analytics?from=2026-10-01&to=2026-10-22
exports.analytics = async (req, res, next) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);
    defaultFrom.setHours(0, 0, 0, 0);

    const from = parseDate(req.query.from, defaultFrom);
    const to = parseDate(req.query.to, now);

    if (!from || !to || from > to) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid date range; from must not be after to.",
      });
    }

    const endExclusive = new Date(to);
    endExclusive.setDate(endExclusive.getDate() + 1);
    endExclusive.setHours(0, 0, 0, 0);

    const match = {
      paymentStatus: "paid",
      testMode: { $ne: true },
      paidAt: { $gte: from, $lt: endExclusive },
    };

    const [dailySales, totals, bestSellers] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$paidAt",
                },
              },
              currency: "$currency",
            },
            revenueInCents: { $sum: "$totalInCents" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]),

      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$currency",
            revenueInCents: { $sum: "$totalInCents" },
            orderCount: { $sum: 1 },
            averageOrderInCents: { $avg: "$totalInCents" },
          },
        },
      ]),

      Order.aggregate([
        { $match: match },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              sku: "$items.sku",
              name: "$items.name",
              size: "$items.size",
            },
            quantitySold: { $sum: "$items.quantity" },
            revenueInCents: { $sum: "$items.lineTotalInCents" },
          },
        },
        { $sort: { quantitySold: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return res.json({
      success: true,
      range: { from, to },
      totalsByCurrency: totals,
      dailySales,
      bestSellers,
    });
  } catch (error) {
    next(error);
  }
};
