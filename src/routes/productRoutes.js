
const express = require("express");

const {
  getProducts,
  getProductBySlug,
} = require("../controllers/productController");

const router = express.Router();

router.get("/", getProducts);
router.get("/:slug", getProductBySlug);

module.exports = router;
