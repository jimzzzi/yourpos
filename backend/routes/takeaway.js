const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

const menuLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many orders. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

async function getCurrencySymbol(storeId, fallbackCurrency) {
  try {
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
    return fallbackCurrency || "AED";
  } catch (error) {
    console.log("Currency symbol fallback:", error.message);
    return fallbackCurrency || "AED";
  }
}

// ========== PUBLIC: Get takeaway menu ==========
router.get("/menu", menuLimiter, async (req, res) => {
  try {
    let store = null;

    // Auth via token param
    const token = req.query.token;
    if (token) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "yourpos-secret-key-change-in-production");
        const storeRes = await db.query("SELECT id, name, currency, tax_rate, tax_inclusive FROM stores WHERE id = $1", [decoded.storeId]);
        if (storeRes.rows.length > 0) store = storeRes.rows[0];
      } catch (e) {}
    }

    // Auth via store param
    if (!store && req.query.store) {
      const storeId = parseInt(req.query.store);
      if (storeId && !Number.isNaN(storeId)) {
        const storeRes = await db.query("SELECT id, name, currency, tax_rate, tax_inclusive FROM stores WHERE id = $1", [storeId]);
        if (storeRes.rows.length > 0) store = storeRes.rows[0];
      }
    }

    // Fallback: first store
    if (!store) {
      const storeRes = await db.query("SELECT id, name, currency, tax_rate, tax_inclusive FROM stores ORDER BY id ASC LIMIT 1");
      if (storeRes.rows.length > 0) store = storeRes.rows[0];
    }

    if (!store) {
      return res.status(404).json({ error: "Store not found." });
    }

    // Categories
    const catsRes = await db.query(
      "SELECT id, name FROM categories WHERE store_id = $1 ORDER BY name ASC",
      [store.id]
    );

    // ✅ Products with stock info
    const productsRes = await db.query(
      `SELECT p.id, p.name, p.description, p.image_url, p.category_id,
              p.track_stock, p.always_sellable, p.is_time_based, p.time_unit_minutes,
              COALESCE(SUM(v.stock_quantity), 0) as total_stock
       FROM products p
       LEFT JOIN variants v ON v.product_id = p.id AND v.is_available = true
       WHERE p.store_id = $1 AND p.is_available = true
       GROUP BY p.id
       ORDER BY p.name ASC`,
      [store.id]
    );

    const productIds = productsRes.rows.map((p) => p.id);
    const variantsByProduct = {};
    if (productIds.length > 0) {
      const variantsRes = await db.query(
        `SELECT id, product_id, name, price, stock_quantity
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
          stock_quantity: Number(v.stock_quantity || 0),
        });
      });
    }

    // Modifiers
    let modifiers = [];
    try {
      const modsRes = await db.query(
        "SELECT id, name, price, category_ids FROM modifiers WHERE store_id = $1 AND is_available = true ORDER BY name ASC",
        [store.id]
      );
      modifiers = modsRes.rows.map((m) => ({
        id: m.id,
        name: m.name,
        price: Number(m.price || 0),
        category_ids: m.category_ids || [],
      }));
    } catch (e) {}

    // ✅ Filter out zero-stock items + map products
    const products = productsRes.rows
      .filter((p) => variantsByProduct[p.id] && variantsByProduct[p.id].length > 0)
      .filter((p) => {
        if (!p.track_stock || p.always_sellable) return true;
        return Number(p.total_stock || 0) > 0;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        category_id: p.category_id,
        track_stock: Boolean(p.track_stock),
        always_sellable: Boolean(p.always_sellable),
        is_time_based: Boolean(p.is_time_based),
        time_unit_minutes: p.time_unit_minutes,
        variants: variantsByProduct[p.id] || [],
      }));

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
      categories: catsRes.rows,
      products,
      modifiers,
    });
  } catch (error) {
    console.error("Takeaway menu error:", error);
    res.status(500).json({ error: "Failed to load menu." });
  }
});

// ========== PUBLIC: Place a takeaway order ==========
router.post("/order", orderLimiter, async (req, res) => {
  try {
    const body = req.body;
    const storeId = parseInt(body.store_id);
    const items = Array.isArray(body.items) ? body.items : [];
    const customerName = String(body.customer_name || "Guest").slice(0, 100);
    const customerPhone = String(body.customer_phone || "").slice(0, 30);
    const note = String(body.note || "").slice(0, 200);

    if (!storeId || Number.isNaN(storeId)) {
      return res.status(400).json({ error: "Invalid store." });
    }
    if (items.length === 0) {
      return res.status(400).json({ error: "Cart is empty." });
    }
    if (items.length > 30) {
      return res.status(400).json({ error: "Too many items in one order." });
    }

    // Validate store exists
    const storeRes = await db.query("SELECT id FROM stores WHERE id = $1", [storeId]);
    if (storeRes.rows.length === 0) {
      return res.status(404).json({ error: "Store not found." });
    }

    // ✅ Validate items + check stock
    const cleanItems = [];
    for (const raw of items) {
      const variantId = parseInt(raw.variant_id);
      const qty = Math.max(1, Math.min(20, parseInt(raw.quantity) || 1));
      const mods = Array.isArray(raw.modifiers) ? raw.modifiers.slice(0, 10) : [];

      if (!variantId || Number.isNaN(variantId)) continue;

      const vRes = await db.query(
        `SELECT v.id, v.name, v.price, v.stock_quantity,
                p.name AS product_name, p.image_url, p.track_stock, p.always_sellable,
                COALESCE((SELECT SUM(v2.stock_quantity) FROM variants v2 WHERE v2.product_id = p.id AND v2.is_available = true), 0) as product_total_stock
         FROM variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = $1 AND p.store_id = $2 AND v.is_available = true AND p.is_available = true`,
        [variantId, storeId]
      );
      if (vRes.rows.length === 0) continue;
      const v = vRes.rows[0];

      // ⛔ Backend stock validation
      if (v.track_stock && !v.always_sellable) {
        if (v.product_total_stock <= 0) continue;
        if (qty > v.product_total_stock) continue;
      }

      // Validate modifiers
      const cleanMods = [];
      for (const mod of mods) {
        const modId = parseInt(mod.modifier_id || mod);
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
        modifiers: cleanMods,
      });
    }

    if (cleanItems.length === 0) {
      return res.status(400).json({ error: "No valid items in cart." });
    }

    // ✅ Insert order + deduct stock in transaction
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Deduct stock for tracked items
      for (const item of cleanItems) {
        const prodCheck = await client.query(
          `SELECT p.track_stock, p.always_sellable FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`,
          [item.variant_id]
        );
        if (prodCheck.rows.length > 0) {
          const prod = prodCheck.rows[0];
          if (prod.track_stock && !prod.always_sellable) {
            await client.query(
              `UPDATE variants SET stock_quantity = GREATEST(stock_quantity - $1, 0), updated_at = NOW() WHERE id = $2`,
              [item.quantity, item.variant_id]
            );
          }
        }
      }

      // Insert takeaway order
      const insertRes = await client.query(
        `INSERT INTO takeaway_orders (store_id, customer_name, customer_phone, note, items, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id, created_at`,
        [storeId, customerName, customerPhone, note, JSON.stringify(cleanItems)]
      );

      await client.query("COMMIT");

      const orderId = insertRes.rows[0].id;
      const orderNumber = String(orderId).padStart(4, "0");

      res.status(201).json({
        success: true,
        order_id: orderId,
        order_number: orderNumber,
        message: "Order received! We'll prepare it shortly.",
      });
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Takeaway order error:", error);
    res.status(500).json({ error: "Failed to place order." });
  }
});

// ========== POS: Get takeaway orders ==========
router.get("/orders", authenticateToken, async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const result = await db.query(
      `SELECT id, customer_name, customer_phone, note, items, status, total, created_at
       FROM takeaway_orders
       WHERE store_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [storeId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get takeaway orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders." });
  }
});

// ========== POS: Accept takeaway order ==========
router.put("/orders/:id/accept", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;
    await db.query(
      "UPDATE takeaway_orders SET status = 'accepted' WHERE id = $1 AND store_id = $2",
      [orderId, storeId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Accept takeaway order error:", error);
    res.status(500).json({ error: "Failed to accept order." });
  }
});

// ========== POS: Complete takeaway order ==========
router.put("/orders/:id/complete", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;
    const paymentMethod = req.body.payment_method || "cash";
    await db.query(
      "UPDATE takeaway_orders SET status = 'completed', payment_method = $1 WHERE id = $2 AND store_id = $3",
      [paymentMethod, orderId, storeId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Complete takeaway order error:", error);
    res.status(500).json({ error: "Failed to complete order." });
  }
});

// ========== POS: Cancel takeaway order ==========
router.put("/orders/:id/cancel", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;

    // ✅ Get order to restore stock
    const orderRes = await db.query(
      "SELECT items FROM takeaway_orders WHERE id = $1 AND store_id = $2",
      [orderId, storeId]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: "Order not found." });
    }

    const items = orderRes.rows[0].items || [];

    // ✅ Restore stock for cancelled items
    for (const item of items) {
      const prodCheck = await db.query(
        `SELECT p.track_stock, p.always_sellable FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`,
        [item.variant_id]
      );
      if (prodCheck.rows.length > 0) {
        const prod = prodCheck.rows[0];
        if (prod.track_stock && !prod.always_sellable) {
          await db.query(
            `UPDATE variants SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2`,
            [item.quantity, item.variant_id]
          );
        }
      }
    }

    await db.query(
      "UPDATE takeaway_orders SET status = 'cancelled' WHERE id = $1 AND store_id = $2",
      [orderId, storeId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Cancel takeaway order error:", error);
    res.status(500).json({ error: "Failed to cancel order." });
  }
});

// ========== PUBLIC: Get order status ==========
router.get("/order/:id/status", async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (!orderId || Number.isNaN(orderId)) {
      return res.status(400).json({ error: "Invalid order ID." });
    }
    const result = await db.query(
      "SELECT id, status FROM takeaway_orders WHERE id = $1",
      [orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found." });
    }
    res.json({ order_id: result.rows[0].id, status: result.rows[0].status });
  } catch (error) {
    console.error("Get order status error:", error);
    res.status(500).json({ error: "Failed to get order status." });
  }
});

module.exports = router;