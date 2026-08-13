const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const mods = await db.query(
      "SELECT id, name, price, is_available FROM modifiers WHERE store_id = $1 AND is_available = true ORDER BY name ASC",
      [req.user.storeId]
    );

    const ids = mods.rows.map((r) => r.id);
    const catsByMod = {};

    if (ids.length > 0) {
      const cats = await db.query(
        "SELECT modifier_id, category_id FROM modifier_categories WHERE modifier_id = ANY($1)",
        [ids]
      );
      cats.rows.forEach((c) => {
        if (!catsByMod[c.modifier_id]) catsByMod[c.modifier_id] = [];
        catsByMod[c.modifier_id].push(c.category_id);
      });
    }

    res.json(
      mods.rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price || 0),
        is_available: r.is_available,
        category_ids: catsByMod[r.id] || [],
      }))
    );
  } catch (error) {
    console.error("Get modifiers error:", error);
    res.status(500).json({ error: "Failed to fetch modifiers." });
  }
});

router.post("/", async (req, res) => {
  const client = await db.getClient();
  try {
    const name = String(req.body.name || "").trim();
    const price = Number(req.body.price || 0);
    const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : [];

    if (!name) return res.status(400).json({ error: "Modifier name is required." });
    if (Number.isNaN(price) || price < 0) return res.status(400).json({ error: "Modifier price must be a valid number." });

    await client.query("BEGIN");

    const result = await client.query(
      "INSERT INTO modifiers (store_id, name, price) VALUES ($1, $2, $3) RETURNING id",
      [req.user.storeId, name, price]
    );
    const id = result.rows[0].id;

    for (const cid of categoryIds) {
      await client.query(
        "INSERT INTO modifier_categories (modifier_id, category_id) VALUES ($1, $2)",
        [id, cid]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ id, name, price, category_ids: categoryIds });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create modifier error:", error);
    res.status(500).json({ error: "Failed to create modifier." });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const client = await db.getClient();
  try {
    const name = String(req.body.name || "").trim();
    const price = Number(req.body.price || 0);
    const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : null;

    if (!name) return res.status(400).json({ error: "Modifier name is required." });

    await client.query("BEGIN");

    const result = await client.query(
      "UPDATE modifiers SET name = $1, price = $2 WHERE id = $3 AND store_id = $4 RETURNING id",
      [name, price, req.params.id, req.user.storeId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Modifier not found." });
    }

    if (categoryIds) {
      await client.query("DELETE FROM modifier_categories WHERE modifier_id = $1", [req.params.id]);
      for (const cid of categoryIds) {
        await client.query(
          "INSERT INTO modifier_categories (modifier_id, category_id) VALUES ($1, $2)",
          [req.params.id, cid]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update modifier error:", error);
    res.status(500).json({ error: "Failed to update modifier." });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE modifiers SET is_available = false WHERE id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Modifier not found." });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete modifier error:", error);
    res.status(500).json({ error: "Failed to delete modifier." });
  }
});

module.exports = router;
