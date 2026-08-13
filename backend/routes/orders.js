const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isNaN(requestedLimit) ? 50 : requestedLimit, 100);

    const result = await db.query(
      "SELECT o.id, o.client_order_id, o.created_at, o.status, o.subtotal, o.tax_amount, o.total_amount, o.payment_method, o.amount_tendered, o.change_due, o.refunded_amount, COUNT(oi.id)::int AS item_count FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE o.store_id = $1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2",
      [storeId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders." });
  }
});

router.post("/:id/refund", async (req, res) => {
  const client = await db.getClient();

  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;
    const reason = req.body.reason || "Full refund";

    await client.query("BEGIN");

    const orderResult = await client.query(
      "SELECT id, total_amount, refunded_amount, status FROM orders WHERE id = $1 AND store_id = $2 FOR UPDATE",
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderResult.rows[0];

    if (order.status === "refunded") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Order is already refunded." });
    }

    const totalAmount = Number(order.total_amount || 0);
    const refundedAmount = Number(order.refunded_amount || 0);
    const remainingAmount = totalAmount - refundedAmount;

    if (remainingAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Order has already been fully refunded." });
    }

    const refundAmount = remainingAmount;

    await client.query(
      "INSERT INTO refunds (order_id, amount, reason, created_by) VALUES ($1, $2, $3, $4)",
      [orderId, refundAmount, reason, req.user.sub]
    );

    await client.query(
      "UPDATE orders SET refunded_amount = refunded_amount + $1, status = 'refunded', updated_at = NOW() WHERE id = $2",
      [refundAmount, orderId]
    );

    await client.query(
      "UPDATE variants v SET stock_quantity = v.stock_quantity + oi.quantity, updated_at = NOW() FROM order_items oi WHERE oi.order_id = $1 AND oi.variant_id = v.id",
      [orderId]
    );

    await client.query("COMMIT");

    res.json({ success: true, refunded_amount: refundAmount });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Refund error:", error);
    res.status(500).json({ error: "Failed to refund order." });
  } finally {
    client.release();
  }
});
// ... all your existing routes stay as they are ...

// 👇👇 PASTE THIS RIGHT HERE (above module.exports)
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const base = await db.query(
      "SELECT * FROM orders WHERE id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId]
    );
    if (base.rows.length === 0) return res.status(404).json({ error: "Order not found." });
    const order = base.rows[0];

    // Bill No = order's position in history (matches the receipt counter)
    if (!order.bill_number) {
      try {
        const bn = await db.query(
          "SELECT (COUNT(*) + 1)::int AS n FROM orders WHERE store_id = $1 AND created_at < (SELECT created_at FROM orders WHERE id = $2)",
          [req.user.storeId, order.id]
        );
        order.bill_number = bn.rows[0] ? bn.rows[0].n : order.id;
      } catch (e) {
        order.bill_number = order.id;
      }
    }

    // 1) If orders table stores items as JSONB, use it
    let items = order.items || null;
    if (typeof items === "string") { try { items = JSON.parse(items); } catch (e) { items = null; } }
    if (!items || (Array.isArray(items) && items.length === 0)) {
      // 2) Try order_items table (both common schemas)
      try {
        const oi = await db.query(
          "SELECT name, description, quantity, unit_price AS price, modifiers FROM order_items WHERE order_id = $1",
          [order.id]
        );
        if (oi.rows.length) items = oi.rows;
      } catch (e) {}
    }
    if (!items || (Array.isArray(items) && items.length === 0)) {
      try {
        const oi = await db.query(
          "SELECT product_name AS name, quantity, price, modifiers FROM order_items WHERE order_id = $1",
          [order.id]
        );
        if (oi.rows.length) items = oi.rows;
      } catch (e) {}
    }
    order.items = items || [];
    res.json(order);
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ error: "Failed to load order." });
  }
});
// 👆👆 END OF PASTE

module.exports = router;
module.exports = router;
