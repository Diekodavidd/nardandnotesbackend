const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const admin = require('../controllers/adminOrderController');
const tracking = require('../controllers/orderTrackingController');
const { purchaseLabel } = require('../services/shippoService');
const Order = require('../models/Order');
const router = express.Router();
router.use(requireAdmin);
router.get('/', admin.listOrders);
router.patch('/:orderId/tracking', tracking.updateTracking);
router.post('/:orderId/retry-confirmation-email', admin.retryCustomerEmail);
router.post('/:orderId/retry-store-notification', admin.retryAdminNotification);
router.post('/:orderId/retry-shipping-email', admin.retryShippingEmail);
router.post('/:orderId/purchase-label', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.testMode !== true && order.paymentStatus !== 'paid') return res.status(409).json({ success: false, message: 'Only paid orders can have labels purchased.' });
    if (!order.shippoRateId) return res.status(409).json({ success: false, message: 'This order has no saved Shippo rate. Requote shipping or attach a valid rate first.' });
    const transaction = await purchaseLabel(order.shippoRateId);
    if (transaction.status !== 'SUCCESS') return res.status(502).json({ success: false, message: 'Shippo did not confirm label creation.', transaction });
    order.shippoTransactionId = transaction.object_id || '';
    order.labelUrl = transaction.label_url || '';
    order.shippingProvider = transaction.rate?.provider || order.shippingProvider;
    order.trackingNumber = transaction.tracking_number || order.trackingNumber;
    order.trackingUrl = transaction.tracking_url_provider || order.trackingUrl;
    await order.save();
    return res.json({ success: true, labelUrl: order.labelUrl, trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl, transactionId: order.shippoTransactionId });
  } catch (error) { next(error); }
});
module.exports = router;
