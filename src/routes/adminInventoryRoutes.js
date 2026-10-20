const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const controller = require('../controllers/adminInventoryController');
const router = express.Router();
router.use(requireAdmin);
router.patch('/:sku/stock', controller.updateVariantStock);
module.exports = router;
