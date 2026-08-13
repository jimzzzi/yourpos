const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.post("/orders", authenticateToken, async (req, res) => {
  const { orders } = req.body;

  if (!orders || !Array.isArray(orders)) {
    return res.status(400).json({ error: "Orders array is required." });
  }

  const results = [];
  const errors = [];

  for (const order of orders) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      if (!order.client_order_id) throw new Error("client_order_id is required.");

      const existingOrder = await client.query(
        "SELECT id FROM orders WHERE client_order_id = $1",
        [order.client_order_id]
      );

      if (existingOrder.rows.length > 0) {
        results.push({ client_order_id: order.client_order_id, order_id: existingOrder.rows[0].id, already_synced: true });
        await client.query("COMMIT");
        continue;
      }

      const subtotal = Number(order.subtotal || 0);
      const taxAmount = Number(order.tax_amount || 0);
      const totalAmount = Number(order.total_amount || 0);
      const discountAmount = Number(order.discount_amount || 0);
      const diningOption = ["dine_in", "takeaway"].includes(order.dining_option) ? order.dining_option : "dine_in";
      const tableName = order.table_name ? String(order.table_name).slice(0, 50) : null;
      const paymentMethod = ["cash", "card", "split"].includes(order.payment_method) ? order.payment_method : "cash";
      const amountTendered = order.amount_tendered === null || order.amount_tendered === undefined ? null : Number(order.amount_tendered);
      const changeDue = order.change_due === null || order.change_due === undefined ? null : Number(order.change_due);

      const orderResult = await client.query(
        "INSERT INTO orders (client_order_id, store_id, cashier_id, subtotal, tax_amount, total_amount, discount_amount, dining_option, table_name, status, is_synced, created_at, payment_method, amount_tendered, change_due, refunded_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $13, $14, 0) RETURNING id",
        [
          order.client_order_id,
          req.user.storeId,
          order.cashier_id || req.user.sub,
          subtotal,
          taxAmount,
          totalAmount,
          discountAmount,
          diningOption,
          tableName,
          order.status || "completed",
          order.created_at || new Date().toISOString(),
          paymentMethod,
          amountTendered,
          changeDue,
        ]
      );

      const newOrderId = orderResult.rows[0].id;

      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const variantId = Number(item.variant_id);
          const quantity = Number(item.quantity);
          const unitPrice = Number(item.unit_price || 0);
          const totalPrice = Number(item.total_price || unitPrice * quantity);

          if (!variantId || !quantity || quantity <= 0) continue;

          const variantCheck = await client.query(
            "SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1 AND p.store_id = $2",
            [variantId, req.user.storeId]
          );
          if (variantCheck.rows.length === 0) continue;

          const itemResult = await client.query(
            "INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [newOrderId, variantId, quantity, unitPrice, totalPrice]
          );

          const orderItemId = itemResult.rows[0].id;

          if (Array.isArray(item.modifiers)) {
            for (const mod of item.modifiers) {
              await client.query(
                "INSERT INTO order_item_modifiers (order_item_id, modifier_id, name, price) VALUES ($1, $2, $3, $4)",
                [orderItemId, mod.modifier_id || null, String(mod.name || "Modifier").slice(0, 100), Number(mod.price || 0)]
              );
            }
          }

          await client.query(
            "UPDATE variants SET stock_quantity = GREATEST(stock_quantity - $1, 0), updated_at = NOW() WHERE id = $2",
            [quantity, variantId]
          );
        }
      }

      const payments =
        Array.isArray(order.payments) && order.payments.length > 0
          ? order.payments
          : [{ method: paymentMethod, amount: totalAmount }];

      for (const payment of payments) {
        const method = ["cash", "card", "split"].includes(payment.method) ? payment.method : "cash";
        const amount = Number(payment.amount || 0);
        if (amount <= 0) continue;
        await client.query("INSERT INTO payments (order_id, method, amount) VALUES ($1, $2, $3)", [newOrderId, method, amount]);
      }

      results.push({ client_order_id: order.client_order_id, order_id: newOrderId, already_synced: false });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Sync order error:", error);
      errors.push({ client_order_id: order.client_order_id || null, error: error.message });
    } finally {
      client.release();
    }
  }

  res.json({ success: true, results, errors });
});

module.exports = router;
