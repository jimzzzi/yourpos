const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// STRICT rate limiting for PUBLIC endpoints (no auth needed)
// Max 60 requests per minute per IP for menu browsing
const menuLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Max 3 orders per minute per IP (anti-spam)
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: "Too many orders. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========== SAFE: Get currency symbol from store settings ==========
async function getCurrencySymbol(storeId, fallbackCurrency) {
  try {
    // Try to get settings from stores table (JSONB column)
    const settingsRes = await db.query(
      "SELECT settings FROM stores WHERE id = $1",
      [storeId]
    );
    
    if (settingsRes.rows[0] && settingsRes.rows[0].settings) {
      const settings = typeof settingsRes.rows[0].settings === "string"
        ? JSON.parse(settingsRes.rows[0].settings)
        : settingsRes.rows[0].settings;
      
      if (settings && settings.currencySymbol) {
        return settings.currencySymbol;
      }
    }
    
    // Fallback to currency field
    return fallbackCurrency || "AED";
  } catch (error) {
    // If anything fails, just return the fallback - NEVER break the app
    console.log("Currency symbol fallback:", error.message);
    return fallbackCurrency || "AED";
  }
}

// ========== PUBLIC: Get menu for a QR table ==========
router.get("/menu", menuLimiter, async (req, res) => {
  try {
    const tableId = parseInt(req.query.t);
    if (!tableId || Number.isNaN(tableId)) {
      return res.status(400).json({ error: "Invalid table code." });
    }

    // 1. Look up the table and its store
    const tableRes = await db.query(
      "SELECT t.id, t.name, t.store_id FROM tables t WHERE t.id = $1 AND t.is_available = true",
      [tableId]
    );
    if (tableRes.rows.length === 0) {
      return res.status(404).json({ error: "Table not found." });
    }
    const table = tableRes.rows[0];

    // 2. Check if QR ordering is enabled for this store (via settings context on the app side, we trust it here)
    // 3. Get the store info
    const storeRes = await db.query(
      "SELECT id, name, currency, tax_rate, tax_inclusive FROM stores WHERE id = $1",
      [table.store_id]
    );
    if (storeRes.rows.length === 0) {
      return res.status(404).json({ error: "Store not found." });
    }
    const store = storeRes.rows[0];

    // 4. Get categories
    const catsRes = await db.query(
      "SELECT id, name FROM categories WHERE store_id = $1 ORDER BY name ASC",
      [table.store_id]
    );

    // 5. Get products with variants (PUBLIC FIELDS ONLY — no stock, no internal IDs)
    const productsRes = await db.query(
      `SELECT 
        p.id, p.name, p.description, p.image_url, p.category_id, p.is_time_based, p.time_unit_minutes
       FROM products p
       WHERE p.store_id = $1 AND p.is_available = true
       ORDER BY p.name ASC`,
      [table.store_id]
    );

    const productIds = productsRes.rows.map((p) => p.id);
    const variantsByProduct = {};
    if (productIds.length > 0) {
      const variantsRes = await db.query(
        `SELECT id, product_id, name, price, is_available
         FROM variants
         WHERE product_id = ANY($1) AND is_available = true
         ORDER BY id ASC`,
        [productIds]
      );
      variantsRes.rows.forEach((v) => {
        if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
        variantsByProduct[v.product_id].push({
          id: v.id,
          name: v.name,
          price: Number(v.price || 0),
        });
      });
    }

    // 6. Get modifiers (optional extras)
    let modifiers = [];
    try {
      const modsRes = await db.query(
        "SELECT id, name, price, category_ids FROM modifiers WHERE store_id = $1 AND is_available = true ORDER BY name ASC",
        [table.store_id]
      );
      modifiers = modsRes.rows.map((m) => ({
        id: m.id,
        name: m.name,
        price: Number(m.price || 0),
        category_ids: m.category_ids || [],
      }));
    } catch (e) {
      // modifiers table might not exist for old stores
    }

    const products = productsRes.rows
      .filter((p) => variantsByProduct[p.id] && variantsByProduct[p.id].length > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        category_id: p.category_id,
        is_time_based: Boolean(p.is_time_based),
        time_unit_minutes: p.time_unit_minutes,
        variants: variantsByProduct[p.id] || [],
      }));

    // Get currency symbol safely (won't break if settings don't exist)
    const currencySymbol = await getCurrencySymbol(store.id, store.currency);

    res.json({
      store: {
        id: store.id,
        name: store.name,
        currency: store.currency || "AED",
        currency_symbol: currencySymbol,
        tax_rate: Number(store.tax_rate || 0),
        tax_inclusive: Boolean(store.tax_inclusive),
      },
      table: { id: table.id, name: table.name },
      categories: catsRes.rows,
      products,
      modifiers,
    });
  } catch (error) {
    console.error("QR menu error:", error);
    res.status(500).json({ error: "Failed to load menu." });
  }
});

// ========== PUBLIC: Place an order from QR ==========
router.post("/order", orderLimiter, async (req, res) => {
  try {
    const tableId = parseInt(req.body.table_id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const note = String(req.body.note || "").slice(0, 100);
    const customerIp = req.ip || req.connection?.remoteAddress || "unknown";

    // Validate table
    if (!tableId || Number.isNaN(tableId)) {
      return res.status(400).json({ error: "Invalid table." });
    }
    if (items.length === 0) {
      return res.status(400).json({ error: "Cart is empty." });
    }
    if (items.length > 30) {
      return res.status(400).json({ error: "Too many items in one order." });
    }

    // Look up table and store
    const tableRes = await db.query(
      "SELECT id, store_id FROM tables WHERE id = $1 AND is_available = true",
      [tableId]
    );
    if (tableRes.rows.length === 0) {
      return res.status(404).json({ error: "Table not found." });
    }
    const storeId = tableRes.rows[0].store_id;

    // Validate each item against real products (prevents fake item injection)
    const cleanItems = [];
    for (const raw of items) {
      const variantId = parseInt(raw.variant_id);
      const qty = Math.max(1, Math.min(10, parseInt(raw.quantity) || 1));
      const mods = Array.isArray(raw.modifiers) ? raw.modifiers.slice(0, 10) : [];
      const noteText = String(raw.note || "").slice(0, 100);

      if (!variantId || Number.isNaN(variantId)) continue;

      const vRes = await db.query(
        `SELECT v.id, v.name, v.price, p.name AS product_name, p.image_url
         FROM variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = $1 AND p.store_id = $2 AND v.is_available = true AND p.is_available = true`,
        [variantId, storeId]
      );
      if (vRes.rows.length === 0) continue; // skip invalid items silently
      const v = vRes.rows[0];

      // Validate modifiers too
      const cleanMods = [];
      for (const mid of mods) {
        const modId = parseInt(mid);
        if (!modId) continue;
        const mRes = await db.query(
          "SELECT id, name, price FROM modifiers WHERE id = $1 AND store_id = $2 AND is_available = true",
          [modId, storeId]
        );
        if (mRes.rows.length > 0) {
          cleanMods.push({
            id: mRes.rows[0].id,
            name: mRes.rows[0].name,
            price: Number(mRes.rows[0].price || 0),
          });
        }
      }

      cleanItems.push({
        variant_id: v.id,
        variant_name: v.name,
        product_name: v.product_name,
        image_url: v.image_url,
        price: Number(v.price || 0),
        quantity: qty,
        note: noteText,
        modifiers: cleanMods,
      });
    }

    if (cleanItems.length === 0) {
      return res.status(400).json({ error: "No valid items in cart." });
    }

    // Insert pending order
    const insertRes = await db.query(
      `INSERT INTO qr_orders (store_id, table_id, items, note, status, customer_ip)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING id, created_at`,
      [storeId, tableId, JSON.stringify(cleanItems), note, customerIp]
    );

    res.status(201).json({
      success: true,
      order_id: insertRes.rows[0].id,
      message: "Order sent! We'll bring it to your table shortly.",
    });
  } catch (error) {
    console.error("QR order error:", error);
    res.status(500).json({ error: "Failed to place order." });
  }
});

// ========== POS: Get pending QR orders (AUTHENTICATED) ==========
router.get("/pending", authenticateToken, async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const result = await db.query(
      "SELECT id, table_id, items, note, created_at FROM qr_orders WHERE store_id = $1 AND status = 'pending' ORDER BY created_at ASC",
      [storeId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get pending QR orders error:", error);
    res.status(500).json({ error: "Failed to fetch pending orders." });
  }
});

// ========== POS: Accept a QR order (AUTHENTICATED) ==========
router.post("/order/:id/accept", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;
    
    const qrRes = await db.query("SELECT * FROM qr_orders WHERE id = $1 AND store_id = $2", [orderId, storeId]);
    if (qrRes.rows.length === 0) return res.status(404).json({ error: "Order not found." });
    const qrOrder = qrRes.rows[0];
    
    await db.query("UPDATE qr_orders SET status = 'accepted' WHERE id = $1", [orderId]);
    
    // Check if table already has an open order (merge if yes)
    const existing = await db.query("SELECT id, items FROM table_orders WHERE table_id = $1 AND store_id = $2 AND status = 'open'", [qrOrder.table_id, storeId]);
    
    if (existing.rows.length > 0) {
      const existingItems = existing.rows[0].items || [];
      const mergedItems = [...existingItems, ...qrOrder.items];
      await db.query("UPDATE table_orders SET items = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(mergedItems), existing.rows[0].id]);
    } else {
      await db.query("INSERT INTO table_orders (store_id, table_id, items, note, status) VALUES ($1, $2, $3, $4, 'open')", [storeId, qrOrder.table_id, JSON.stringify(qrOrder.items), qrOrder.note]);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Accept QR order error:", error);
    res.status(500).json({ error: "Failed to accept order." });
  }
});

// ========== POS: Reject a QR order (AUTHENTICATED) ==========
router.post("/order/:id/reject", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;
    await db.query("UPDATE qr_orders SET status = 'rejected' WHERE id = $1 AND store_id = $2", [orderId, storeId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Reject QR order error:", error);
    res.status(500).json({ error: "Failed to reject order." });
  }
});

module.exports = router;