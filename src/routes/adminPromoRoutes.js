const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const controller = require('../controllers/adminPromoController');
const router = express.Router();
router.use(requireAdmin);
router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
module.exports = router;
