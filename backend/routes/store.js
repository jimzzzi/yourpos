const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, currency, tax_rate, tax_inclusive FROM stores WHERE id = $1",
      [req.user.storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Store not found." });
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      currency: row.currency,
      tax_rate: Number(row.tax_rate || 0),
      tax_inclusive: Boolean(row.tax_inclusive),
    });
  } catch (error) {
    console.error("Get store error:", error);
    res.status(500).json({ error: "Failed to fetch store." });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const taxInclusive = req.body.tax_inclusive === true;
    const taxRate = req.body.tax_rate !== undefined ? Number(req.body.tax_rate) : null;

    let query = "UPDATE stores SET tax_inclusive = $1";
    const params = [taxInclusive];

    if (taxRate !== null && !Number.isNaN(taxRate) && taxRate >= 0 && taxRate <= 100) {
      params.push(taxRate);
      query += ", tax_rate = $2";
    }

    params.push(req.user.storeId);
    query += " WHERE id = $" + params.length + " RETURNING id, name, currency, tax_rate, tax_inclusive";

    const result = await db.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: "Store not found." });

    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      currency: row.currency,
      tax_rate: Number(row.tax_rate || 0),
      tax_inclusive: Boolean(row.tax_inclusive),
    });
  } catch (error) {
    console.error("Update store settings error:", error);
    res.status(500).json({ error: "Failed to update store settings." });
  }
});

module.exports = router;
