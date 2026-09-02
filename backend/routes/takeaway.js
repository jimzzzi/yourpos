const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// Rate limiters
const menuLimiter = rateLimit({ 
  windowMs: 60 * 1000, 
  max: 60, 
  message: { error: "Too many requests. Please wait a moment." }, 
  standardHeaders: true, 
  legacyHeaders: false 
});

const orderLimiter = rateLimit({ 
  windowMs: 60 * 1000, 
  max: 100, 
  message: { error: "Too many orders. Please wait a moment." }, 
  standardHeaders: true, 
  legacyHeaders: false 
});

// ========== PUBLIC: Takeaway menu ==========
router.get("/menu", menuLimiter, async (req, res) => {
  try {
    const takeawayToken = req.query.token;
    const storeId = parseInt(req.query.store);

    let storeRes;
    if (takeawayToken) {
      storeRes = await db.query("SELECT id, name, currency, tax_rate, tax_inclusive FROM stores WHERE takeaway_token = $1", [takeawayToken]);
    } else if (storeId && !Number.isNaN(storeId)) {
      storeRes = await db.query("SELECT id, name, currency, tax_rate, tax_inclusive FROM stores WHERE id = $1", [storeId]);
    } else {
      return res.status(400).json({ error: "Invalid store code." });
    }

    if (storeRes.rows.length === 0) return res.status(404).json({ error: "Store not found." });
    const store = storeRes.rows[0];

    let currencySymbol = store.currency || "AED";
    try {
      const sRes = await db.query("SELECT settings FROM stores WHERE id = $1", [store.id]);
      if (sRes.rows[0] && sRes.rows[0].settings) {
        const s = typeof sRes.rows[0].settings === "string" ? JSON.parse(sRes.rows[0].settings) : sRes.rows[0].settings;
        if (s && s.currencySymbol) currencySymbol = s.currencySymbol;
      }
    } catch (e) {}

    const catsRes = await db.query("SELECT id, name FROM categories WHERE store_id = $1 ORDER BY name ASC", [store.id]);

    const productsRes = await db.query(
      `SELECT p.id, p.name, p.description, p.image_url, p.category_id,
              p.track_stock, p.always_sellable, p.is_time_based, p.time_unit_minutes,
              COALESCE(SUM(v.stock_quantity), 0) as total_stock
       FROM products p
       LEFT JOIN variants v ON v.product_id = p.id AND v.is_available = true
       WHERE p.store_id = $1 AND p.is_available = true AND COALESCE(p.sold_by_weight, false) = false
       GROUP BY p.id
       ORDER BY p.name ASC`,
      [store.id]
    );

    const productIds = productsRes.rows.map((p) => p.id);
    const variantsByProduct = {};
    if (productIds.length > 0) {
      const variantsRes = await db.query(
        "SELECT id, product_id, name, price, stock_quantity FROM variants WHERE product_id = ANY($1) AND is_available = true ORDER BY id ASC",
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

    let modifiers = [];
    try {
      const modsRes = await db.query("SELECT id, name, price, category_ids FROM modifiers WHERE store_id = $1 AND is_available = true ORDER BY name ASC", [store.id]);
      modifiers = modsRes.rows.map((m) => ({ id: m.id, name: m.name, price: Number(m.price || 0), category_ids: m.category_ids || [] }));
    } catch (e) {}

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

// ========== PUBLIC: Place takeaway order with stock validation ==========
router.post("/order", orderLimiter, async (req, res) => {
  try {
    const storeId = parseInt(req.body.store_id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const customerName = String(req.body.customer_name || "Guest").slice(0, 100);
    const customerPhone = String(req.body.customer_phone || "").slice(0, 30);
    const note = String(req.body.note || "").slice(0, 200);
    const customerIp = req.ip || "unknown";

    if (!storeId || Number.isNaN(storeId)) return res.status(400).json({ error: "Invalid store." });
    if (items.length === 0) return res.status(400).json({ error: "Cart is empty." });
    if (items.length > 30) return res.status(400).json({ error: "Too many items." });

    const storeRes = await db.query("SELECT id, tax_rate, tax_inclusive FROM stores WHERE id = $1", [storeId]);
    if (storeRes.rows.length === 0) return res.status(404).json({ error: "Store not found." });
    const store = storeRes.rows[0];

    const cleanItems = [];
    let subtotal = 0;
    
    for (const raw of items) {
      const variantId = parseInt(raw.variant_id);
      const qty = Math.max(1, Math.min(50, parseInt(raw.quantity) || 1));
      const mods = Array.isArray(raw.modifiers) ? raw.modifiers.slice(0, 10) : [];
      if (!variantId || Number.isNaN(variantId)) continue;

      const vRes = await db.query(
        `SELECT v.id, v.name, v.price, v.stock_quantity,
                p.name AS product_name, p.id AS product_id, p.category_id,
                p.track_stock, p.always_sellable,
                COALESCE((SELECT SUM(v2.stock_quantity) FROM variants v2 WHERE v2.product_id = p.id AND v2.is_available = true), 0) as product_total_stock
         FROM variants v 
         JOIN products p ON p.id = v.product_id
         WHERE v.id = $1 AND p.store_id = $2 AND v.is_available = true AND p.is_available = true AND COALESCE(p.sold_by_weight, false) = false`,
        [variantId, storeId]
      );
      if (vRes.rows.length === 0) continue;
      const v = vRes.rows[0];

      // ⛔ Stock validation
      if (v.track_stock && !v.always_sellable) {
        if (v.product_total_stock <= 0) {
          return res.status(400).json({ error: v.product_name + " is out of stock." });
        }
        if (qty > v.product_total_stock) {
          return res.status(400).json({ error: v.product_name + " only has " + v.product_total_stock + " in stock." });
        }
      }

      let unitPrice = Number(v.price || 0);
      const cleanMods = [];
      for (const m of mods) {
        const modId = parseInt(m.modifier_id || m.id);
        if (!modId) continue;
        const mRes = await db.query("SELECT id, name, price FROM modifiers WHERE id = $1 AND store_id = $2 AND is_available = true", [modId, storeId]);
        if (mRes.rows.length > 0) {
          cleanMods.push({ modifier_id: mRes.rows[0].id, name: mRes.rows[0].name, price: Number(mRes.rows[0].price || 0) });
          unitPrice += Number(mRes.rows[0].price || 0);
        }
      }

      subtotal += unitPrice * qty;
      cleanItems.push({
        variant_id: v.id,
        product_id: v.product_id,
        category_id: v.category_id,
        name: v.product_name + (v.name && v.name !== "Default" ? " (" + v.name + ")" : ""),
        price: unitPrice,
        quantity: qty,
        modifiers: cleanMods,
      });
    }

    if (cleanItems.length === 0) return res.status(400).json({ error: "No valid items in cart." });

    const taxRate = Number(store.tax_rate || 0) / 100;
    let tax, total;
    if (store.tax_inclusive) {
      total = subtotal;
      tax = total - total / (1 + taxRate);
    } else {
      tax = subtotal * taxRate;
      total = subtotal + tax;
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

      const insertRes = await client.query(
        `INSERT INTO takeaway_orders (store_id, customer_name, customer_phone, note, items, subtotal, tax, total, status, customer_ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
         RETURNING id, created_at`,
        [storeId, customerName, customerPhone, note, JSON.stringify(cleanItems), subtotal, tax, total, customerIp]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        order_id: insertRes.rows[0].id,
        order_number: String(insertRes.rows[0].id).padStart(4, "0"),
        message: "Order received! Pay at the counter when you pick up.",
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

// ========== PUBLIC: Customer checks order status ==========
router.get("/order/:id/status", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, status, total, customer_name, created_at, accepted_at, paid_at FROM takeaway_orders WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Order not found." });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to get status." });
  }
});

// ========== POS: List active takeaway orders (AUTH) ==========
router.get("/orders", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM takeaway_orders WHERE store_id = $1 AND status IN ('pending', 'accepted') ORDER BY created_at ASC LIMIT 50",
      [req.user.storeId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get takeaway orders error:", error);
    res.status(500).json({ error: "Failed to fetch takeaway orders." });
  }
});

// ========== POS: Accept (AUTH) ==========
router.put("/orders/:id/accept", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE takeaway_orders SET status = 'accepted', accepted_by = $1, accepted_at = NOW() WHERE id = $2 AND store_id = $3 AND status = 'pending' RETURNING id",
      [req.user.name || "Staff", req.params.id, req.user.storeId]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: "Order not found or already accepted." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to accept order." });
  }
});

// ========== POS: Complete after payment (AUTH) ==========
router.put("/orders/:id/complete", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE takeaway_orders SET status = 'completed', paid_at = NOW(), payment_method = $1 WHERE id = $2 AND store_id = $3 RETURNING id",
      [req.body.payment_method || "cash", req.params.id, req.user.storeId]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: "Order not found." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to complete order." });
  }
});

// ========== POS: Cancel with stock restoration (AUTH) ==========
router.put("/orders/:id/cancel", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;

    // Get order to restore stock
    const orderRes = await db.query(
      "SELECT items FROM takeaway_orders WHERE id = $1 AND store_id = $2 AND status IN ('pending', 'accepted')",
      [orderId, storeId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: "Order not found or cannot be cancelled." });
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
    console.error("Cancel order error:", error);
    res.status(500).json({ error: "Failed to cancel order." });
  }
});

// ========== POS: Get Takeaway QR Link (AUTH) ==========
router.get("/qr-link", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT takeaway_token FROM stores WHERE id = $1",
      [req.user.storeId]
    );
    if (result.rows.length === 0 || !result.rows[0].takeaway_token) {
      return res.status(404).json({ error: "Takeaway token not found." });
    }
    res.json({ token: result.rows[0].takeaway_token });
  } catch (error) {
    res.status(500).json({ error: "Failed to get takeaway link." });
  }
});

module.exports = router;