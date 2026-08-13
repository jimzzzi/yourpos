const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

const ADMIN_PASSWORD = "5710085";

router.post("/reset/full", async (req, res) => {
  try {
    const password = req.body.password;
    if (password !== ADMIN_PASSWORD) {
      return res.status(403).json({ error: "Invalid admin password." });
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      
      // Delete all data except stores and users structure
      await client.query("TRUNCATE TABLE order_item_modifiers RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE order_items RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE payments RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE refunds RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE cash_movements RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE variants RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE categories RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE modifiers RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE modifier_categories RESTART IDENTITY CASCADE");
      
      await client.query("COMMIT");
      res.json({ success: true, message: "Full database reset completed." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Full reset error:", error);
    res.status(500).json({ error: "Failed to reset database." });
  }
});

router.post("/reset/sales", async (req, res) => {
  try {
    const password = req.body.password;
    if (password !== ADMIN_PASSWORD) {
      return res.status(403).json({ error: "Invalid admin password." });
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      
      // Delete only sales/transaction data
      await client.query("TRUNCATE TABLE order_item_modifiers RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE order_items RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE payments RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE refunds RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE");
      await client.query("TRUNCATE TABLE cash_movements RESTART IDENTITY CASCADE");
      
      // Reset stock quantities to 0
      await client.query("UPDATE variants SET stock_quantity = 0");
      
      await client.query("COMMIT");
      res.json({ success: true, message: "Sales data reset completed. Products and categories preserved." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Sales reset error:", error);
    res.status(500).json({ error: "Failed to reset sales data." });
  }
});

module.exports = router;