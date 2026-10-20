const Order = require('../models/Order');
const User = require('../models/User');
const { sendOrderConfirmation, sendShippingUpdate } = require('../services/orderEmailService');
const { sendNewOrderAlert } = require('../services/adminNotificationService');

exports.listOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email').lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ success: true, orders, page, limit, total });
  } catch (error) { next(error); }
};
exports.retryCustomerEmail = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const user = await User.findById(order.user).select('email');
    if (!user?.email) return res.status(409).json({ success: false, message: 'Customer email is unavailable.' });
    const result = await sendOrderConfirmation(order, user.email);
    order.emailStatus = result.sent ? 'sent' : result.reason === 'not_configured' ? 'not_configured' : 'failed';
    if (result.sent) order.emailSentAt = new Date();
    await order.save();
    res.json({ success: result.sent, emailStatus: order.emailStatus, message: result.sent ? 'Confirmation email sent.' : 'Email could not be sent.' });
  } catch (error) { next(error); }
};
exports.retryAdminNotification = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const result = await sendNewOrderAlert(order);
    res.status(result.sent ? 200 : 503).json({ success: result.sent, message: result.sent ? 'Store notification sent.' : 'Store notification failed or is not configured.' });
  } catch (error) { next(error); }
};
exports.retryShippingEmail = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.status !== 'shipped') return res.status(409).json({ success: false, message: 'Only shipped orders can receive a shipping update.' });
    const user = await User.findById(order.user).select('email');
    if (!user?.email) return res.status(409).json({ success: false, message: 'Customer email is unavailable.' });
    const result = await sendShippingUpdate(order, user.email);
    res.status(result.sent ? 200 : 503).json({ success: result.sent, message: result.sent ? 'Shipping update sent.' : 'Shipping update failed or is not configured.' });
  } catch (error) { next(error); }
};
