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

    // Get current user's store_id
    const storeId = req.user.store_id;
    if (!storeId) {
      return res.status(400).json({ error: "No store associated with this account." });
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      
      console.log(`[RESET] Full reset for store_id: ${storeId}`);

      // Delete all data for THIS STORE ONLY (using store_id filter)
      
      // Order-related tables (linked via orders.store_id)
      await client.query(`
        DELETE FROM order_item_modifiers 
        WHERE order_item_id IN (
          SELECT oi.id FROM order_items oi 
          INNER JOIN orders o ON oi.order_id = o.id 
          WHERE o.store_id = $1
        )
      `, [storeId]);
      
      await client.query(`
        DELETE FROM order_items 
        WHERE order_id IN (
          SELECT id FROM orders WHERE store_id = $1
        )
      `, [storeId]);
      
      await client.query(`
        DELETE FROM payments 
        WHERE order_id IN (
          SELECT id FROM orders WHERE store_id = $1
        )
      `, [storeId]);
      
      await client.query(`
        DELETE FROM refunds 
        WHERE order_id IN (
          SELECT id FROM orders WHERE store_id = $1
        )
      `, [storeId]);
      
      await client.query("DELETE FROM orders WHERE store_id = $1", [storeId]);
      
      // Cash movements (directly linked to store)
      await client.query("DELETE FROM cash_movements WHERE store_id = $1", [storeId]);
      
      // Variants (linked via products.store_id)
      await client.query(`
        DELETE FROM variants 
        WHERE product_id IN (
          SELECT id FROM products WHERE store_id = $1
        )
      `, [storeId]);
      
      // Products (directly linked to store)
      await client.query("DELETE FROM products WHERE store_id = $1", [storeId]);
      
      // Categories (directly linked to store)
      await client.query("DELETE FROM categories WHERE store_id = $1", [storeId]);
      
      // Modifiers (if they have store_id)
      try {
        await client.query("DELETE FROM modifiers WHERE store_id = $1", [storeId]);
      } catch (e) {
        console.log("[RESET] Modifiers table may not have store_id, skipping");
      }
      
      // Modifier categories (linked via categories.store_id)
      try {
        await client.query(`
          DELETE FROM modifier_categories 
          WHERE category_id IN (
            SELECT id FROM categories WHERE store_id = $1
          )
        `, [storeId]);
      } catch (e) {
        console.log("[RESET] Modifier_categories cleanup skipped:", e.message);
      }
      
      await client.query("COMMIT");
      res.json({ 
        success: true, 
        message: `Full reset completed for store ${storeId}. Only your store's data was deleted.` 
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Full reset error:", error);
    res.status(500).json({ error: "Failed to reset database: " + error.message });
  }
});

router.post("/reset/sales", async (req, res) => {
  try {
    const password = req.body.password;
    if (password !== ADMIN_PASSWORD) {
      return res.status(403).json({ error: "Invalid admin password." });
    }

    // Get current user's store_id
    const storeId = req.user.store_id;
    if (!storeId) {
      return res.status(400).json({ error: "No store associated with this account." });
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      
      console.log(`[RESET] Sales reset for store_id: ${storeId}`);

      // Delete only sales/transaction data for THIS STORE
      
      await client.query(`
        DELETE FROM order_item_modifiers 
        WHERE order_item_id IN (
          SELECT oi.id FROM order_items oi 
          INNER JOIN orders o ON oi.order_id = o.id 
          WHERE o.store_id = $1
        )
      `, [storeId]);
      
      await client.query(`
        DELETE FROM order_items 
        WHERE order_id IN (
          SELECT id FROM orders WHERE store_id = $1
        )
      `, [storeId]);
      
      await client.query(`
        DELETE FROM payments 
        WHERE order_id IN (
          SELECT id FROM orders WHERE store_id = $1
        )
      `, [storeId]);
      
      await client.query(`
        DELETE FROM refunds 
        WHERE order_id IN (
          SELECT id FROM orders WHERE store_id = $1
        )
      `, [storeId]);
      
      await client.query("DELETE FROM orders WHERE store_id = $1", [storeId]);
      await client.query("DELETE FROM cash_movements WHERE store_id = $1", [storeId]);
      
      // Reset stock quantities to 0 for THIS STORE ONLY
      await client.query(`
        UPDATE variants 
        SET stock_quantity = 0 
        WHERE product_id IN (
          SELECT id FROM products WHERE store_id = $1
        )
      `, [storeId]);
      
      await client.query("COMMIT");
      res.json({ 
        success: true, 
        message: `Sales data reset completed for store ${storeId}. Products and categories preserved.` 
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Sales reset error:", error);
    res.status(500).json({ error: "Failed to reset sales data: " + error.message });
  }
});

module.exports = router;