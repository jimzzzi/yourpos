const express = require("express");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// KDS feature stub - will be activated later
// Currently disabled to prevent deployment errors

router.get("/orders", async (req, res) => {
  res.json([]); // Return empty array - KDS disabled
});

router.post("/orders", async (req, res) => {
  res.status(200).json({ success: true, id: null, message: "KDS disabled" });
});

router.put("/orders/:id/status", async (req, res) => {
  res.json({ success: true });
});

router.delete("/orders/cleanup", async (req, res) => {
  res.json({ success: true, deleted: 0 });
});

module.exports = router;