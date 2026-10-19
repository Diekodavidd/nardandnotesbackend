
const express = require('express');
const account = require('../controllers/accountController');
const requireAuth = require('../middleware/requireAuth');
const paymentMethods = require("../controllers/paymentMethodController");
const cloudinaryController = require("../controllers/cloudinaryController");
const wishlistController = require("../controllers/wishlistController");
const router = express.Router();

router.use(requireAuth);

router.post(
  "/profile/avatar-signature",
  cloudinaryController.createAvatarUploadSignature
);

router.get('/profile', account.getProfile);
router.patch('/profile', account.updateProfile);
router.patch('/password', account.changePassword);

router.get('/orders', account.getOrders);
router.get('/orders/:id', account.getOrderById);

router.get('/addresses', account.listAddresses);
router.post('/addresses', account.createAddress);
router.patch('/addresses/:addressId', account.updateAddress);
router.delete('/addresses/:addressId', account.deleteAddress);

router.get("/wishlist", wishlistController.getWishlist);

router.post("/wishlist/:productId", wishlistController.addToWishlist);

router.delete(
  "/wishlist/:productId",
  wishlistController.removeFromWishlist
);


router.post(
  "/payment-methods/setup",
  paymentMethods.createSetupIntent
);

router.get(
  "/payment-methods",
  paymentMethods.listPaymentMethods
);

router.patch(
  "/payment-methods/:id/default",
  paymentMethods.setDefaultPaymentMethod
);

router.delete(
  "/payment-methods/:id",
  paymentMethods.removePaymentMethod
);


module.exports = router;
