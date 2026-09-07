const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// ========== GET: All ingredients for store ==========
router.get("/", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const result = await db.query(
      `SELECT * FROM ingredients 
       WHERE store_id = $1 AND is_available = true 
       ORDER BY name ASC`,
      [storeId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get ingredients error:", error);
    res.status(500).json({ error: "Failed to fetch ingredients." });
  }
});

// ========== GET: Low stock ingredients ==========
router.get("/low-stock", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const result = await db.query(
      `SELECT * FROM ingredients 
       WHERE store_id = $1 AND is_available = true AND current_stock <= min_stock
       ORDER BY current_stock ASC`,
      [storeId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get low stock error:", error);
    res.status(500).json({ error: "Failed to fetch low stock ingredients." });
  }
});

// ========== POST: Create ingredient ==========
router.post("/", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const { name, unit, current_stock, min_stock, cost_per_unit } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Ingredient name is required." });
    }

    const result = await db.query(
      `INSERT INTO ingredients (store_id, name, unit, current_stock, min_stock, cost_per_unit)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        storeId,
        name.trim(),
        unit || "kg",
        current_stock || 0,
        min_stock || 0,
        cost_per_unit || 0
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create ingredient error:", error);
    res.status(500).json({ error: "Failed to create ingredient." });
  }
});

// ========== PUT: Update ingredient ==========
router.put("/:id", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const ingredientId = req.params.id;
    const { name, unit, current_stock, min_stock, cost_per_unit, is_available } = req.body;

    const result = await db.query(
      `UPDATE ingredients 
       SET name = COALESCE($1, name),
           unit = COALESCE($2, unit),
           current_stock = COALESCE($3, current_stock),
           min_stock = COALESCE($4, min_stock),
           cost_per_unit = COALESCE($5, cost_per_unit),
           is_available = COALESCE($6, is_available),
           updated_at = NOW()
       WHERE id = $7 AND store_id = $8
       RETURNING *`,
      [name, unit, current_stock, min_stock, cost_per_unit, is_available, ingredientId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ingredient not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update ingredient error:", error);
    res.status(500).json({ error: "Failed to update ingredient." });
  }
});

// ========== DELETE: Soft delete ingredient ==========
router.delete("/:id", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const ingredientId = req.params.id;

    await db.query(
      `UPDATE ingredients SET is_available = false, updated_at = NOW() 
       WHERE id = $1 AND store_id = $2`,
      [ingredientId, storeId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Delete ingredient error:", error);
    res.status(500).json({ error: "Failed to delete ingredient." });
  }
});

module.exports = router;