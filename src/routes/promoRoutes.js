const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const controller = require('../controllers/promoController');
const router = express.Router();
router.post('/validate', requireAuth, controller.validate);
module.exports = router;
