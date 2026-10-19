
const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");

exports.createAvatarUploadSignature = async (req, res, next) => {
  try {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      process.env;

    if (
      !CLOUDINARY_CLOUD_NAME ||
      !CLOUDINARY_API_KEY ||
      !CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({
        success: false,
        message: "Image uploads are not configured.",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "nard-and-notes/profile-avatars";
    const publicId = `customer_${String(req.user._id)}_${crypto.randomUUID()}`;

    const paramsToSign = {
      folder,
      public_id: publicId,
      timestamp,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      CLOUDINARY_API_SECRET
    );

    res.json({
      success: true,
      cloudName: CLOUDINARY_CLOUD_NAME,
      apiKey: CLOUDINARY_API_KEY,
      timestamp,
      folder,
      publicId,
      signature,
    });
  } catch (error) {
    next(error);
  }
};
