const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.post("/movements", async (req, res) => {
  try {
    const type = req.body.type === "cash_in" ? "cash_in" : req.body.type === "cash_out" ? "cash_out" : null;
    const amount = Number(req.body.amount || 0);
    const note = String(req.body.note || "").slice(0, 300);

    if (!type) return res.status(400).json({ error: "Invalid type." });
    if (!amount || amount <= 0) return res.status(400).json({ error: "Amount must be greater than zero." });

    const result = await db.query(
      "INSERT INTO cash_movements (store_id, user_id, type, amount, note) VALUES ($1, $2, $3, $4, $5) RETURNING id, type, amount, note, created_at",
      [req.user.storeId, req.user.sub, type, amount, note]
    );
    const row = result.rows[0];
    res.status(201).json({ id: row.id, type: row.type, amount: Number(row.amount), note: row.note, created_at: row.created_at });
  } catch (error) {
    console.error("Create cash movement error:", error);
    res.status(500).json({ error: "Failed to save cash movement." });
  }
});

router.get("/movements", async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10);
    const d = Number.isNaN(days) || days <= 0 ? 7 : Math.min(days, 365);
    const result = await db.query(
      "SELECT id, type, amount, note, created_at FROM cash_movements WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2 ORDER BY created_at DESC LIMIT 100",
      [req.user.storeId, d]
    );
    res.json(result.rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (error) {
    console.error("Get cash movements error:", error);
    res.status(500).json({ error: "Failed to fetch cash movements." });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10);
    const d = Number.isNaN(days) || days <= 0 ? 7 : Math.min(days, 365);
    const result = await db.query(
      "SELECT COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE 0 END), 0) AS cash_in, COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0) AS cash_out FROM cash_movements WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2",
      [req.user.storeId, d]
    );
    const cashIn = Number(result.rows[0].cash_in || 0);
    const cashOut = Number(result.rows[0].cash_out || 0);
    res.json({ cash_in: cashIn, cash_out: cashOut, net: cashIn - cashOut });
  } catch (error) {
    console.error("Cash summary error:", error);
    res.status(500).json({ error: "Failed to fetch cash summary." });
  }
});

module.exports = router;
