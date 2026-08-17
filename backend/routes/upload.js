const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer stores file in memory (not disk)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// POST /api/upload/image
router.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "yourpos",
            transformation: [
              { width: 800, height: 800, crop: "limit" },
              { quality: "auto" },
              { format: "webp" },
            ],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(req.file.buffer);
    });

    res.json({ 
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image." });
  }
});

// DELETE /api/upload/image (optional - to delete images)
router.delete("/image", async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) return res.status(400).json({ error: "public_id required." });
    
    await cloudinary.uploader.destroy(public_id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete image." });
  }
});

module.exports = router;