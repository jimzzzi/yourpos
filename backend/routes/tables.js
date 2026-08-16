const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const tablesRes = await db.query(
      "SELECT id, name FROM tables WHERE store_id = $1 AND is_available = true ORDER BY id ASC",
      [req.user.storeId]
    );
    const ordersRes = await db.query(
       "SELECT id, table_id, items, note, dining_option, created_at FROM table_orders WHERE store_id = $1 AND status = 'open'",
      [req.user.storeId]
    );
    const byTable = {};
    ordersRes.rows.forEach((o) => {
      byTable[o.table_id] = { id: o.id, items: o.items, note: o.note, dining_option: o.dining_option, created_at: o.created_at };
    });
    res.json(tablesRes.rows.map((t) => ({ id: t.id, name: t.name, open_order: byTable[t.id] || null })));
  } catch (error) {
    console.error("Get tables error:", error);
    res.status(500).json({ error: "Failed to fetch tables." });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Table name is required." });
    const result = await db.query(
      "INSERT INTO tables (store_id, name) VALUES ($1, $2) RETURNING id, name",
      [req.user.storeId, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create table error:", error);
    res.status(500).json({ error: "Failed to create table." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.query("UPDATE tables SET is_available = false WHERE id = $1 AND store_id = $2", [req.params.id, req.user.storeId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete table error:", error);
    res.status(500).json({ error: "Failed to delete table." });
  }
});

router.put("/:id/order", async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const note = String(req.body.note || "");
    const existing = await db.query(
      "SELECT id FROM table_orders WHERE table_id = $1 AND store_id = $2 AND status = 'open'",
      [req.params.id, req.user.storeId]
    );
    if (existing.rows.length > 0) {
      // Update existing order - DON'T change created_at
      await db.query("UPDATE table_orders SET items = $1, note = $2, updated_at = NOW() WHERE id = $3", [JSON.stringify(items), note, existing.rows[0].id]);
    } else {
      // NEW order - explicitly set created_at
      await db.query("INSERT INTO table_orders (store_id, table_id, items, note, created_at) VALUES ($1, $2, $3, $4, NOW())", [req.user.storeId, req.params.id, JSON.stringify(items), note]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Save table order error:", error);
    res.status(500).json({ error: "Failed to save table order." });
  }
});

router.delete("/:id/order", async (req, res) => {
  try {
    await db.query("DELETE FROM table_orders WHERE table_id = $1 AND store_id = $2 AND status = 'open'", [req.params.id, req.user.storeId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Clear table order error:", error);
    res.status(500).json({ error: "Failed to clear table order." });
  }
});

module.exports = router;
