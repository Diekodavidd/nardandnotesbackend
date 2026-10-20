const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const controller = require('../controllers/shippingController');
const router = express.Router();
router.post('/rates', requireAuth, controller.getRates);
module.exports = router;
