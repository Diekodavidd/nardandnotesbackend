const express = require('express');
const { body, validationResult } = require('express-validator');
const requireAuth = require('../middleware/requireAuth');
const checkout = require('../controllers/checkoutController');
const checkoutController = require("../controllers/testCheckoutController");
const router = express.Router();


router.post(
  "/test",
  requireAuth,
  checkoutController.createTestPurchase
);

router.post('/create-session', requireAuth, body('items').isArray({ min: 1, max: 50 }), (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid checkout request.' });
  next();
}, checkout.createCheckoutSession);


module.exports = router;





