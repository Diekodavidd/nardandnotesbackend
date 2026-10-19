
const express = require("express");
const router = express.Router();

const cartController = require("../controllers/cartController");
const requireAuth = require("../middleware/requireAuth");

router.use(requireAuth);

router.get("/", cartController.getCart);
router.post("/items", cartController.addItem);
router.patch("/items/:lineKey", cartController.updateItem);
router.delete("/items/:lineKey", cartController.removeItem);

module.exports = router;
