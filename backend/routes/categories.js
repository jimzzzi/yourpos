const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, color FROM categories WHERE store_id = $1 ORDER BY name ASC",
      [req.user.storeId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories." });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const color = String(req.body.color || "#CCCCCC").trim();

    if (!name) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const result = await db.query(
      "INSERT INTO categories (store_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color",
      [req.user.storeId, name, color]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ error: "Failed to create category." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const color = String(req.body.color || "#CCCCCC").trim();

    if (!name) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const result = await db.query(
      "UPDATE categories SET name = $1, color = $2 WHERE id = $3 AND store_id = $4 RETURNING id, name, color",
      [name, color, req.params.id, req.user.storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ error: "Failed to update category." });
  }
});

router.delete("/:id", async (req, res) => {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE products SET category_id = NULL WHERE category_id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId]
    );

    const result = await client.query(
      "DELETE FROM categories WHERE id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId]
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete category error:", error);
    res.status(500).json({ error: "Failed to delete category." });
  } finally {
    client.release();
  }
});

module.exports = router;
