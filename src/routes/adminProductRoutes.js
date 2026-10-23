
const express = require("express");
const requireAdmin = require("../middleware/requireAdmin");
const products = require("../controllers/adminProductController");

const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new Error("Only JPG, PNG and WebP images are allowed."));
    }

    callback(null, true);
  },
});

router.post("/upload-image", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image.",
      });
    }

    const imageUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "nard-and-notes/products",
          resource_type: "image",
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );

      stream.end(req.file.buffer);
    });

    return res.status(201).json({
      success: true,
      imageUrl,
    });
  } catch (error) {
    next(error);
  }
});
router.use(requireAdmin);

router.get("/", products.list);
router.post("/", products.create);
router.patch("/:id", products.update);
router.delete("/:id", products.remove);

module.exports = router;
