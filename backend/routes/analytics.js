const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

function getDays(req) {
  const days = parseInt(req.query.days, 10);
  return Number.isNaN(days) || days <= 0 ? 31 : Math.min(days, 365);
}

router.get("/sales", async (req, res) => {
  try {
    const days = getDays(req);
    const result = await db.query(
      "SELECT DATE(created_at) AS date, SUM(total_amount) AS revenue, COUNT(id) AS order_count FROM orders WHERE status = 'completed' AND store_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC",
      [req.user.storeId, days]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Analytics sales error:", error);
    res.status(500).json({ error: "Failed to fetch sales." });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const days = getDays(req);
    const storeId = req.user.storeId;
    const ordersRes = await db.query(
      "SELECT COALESCE(SUM(total_amount),0) AS revenue, COUNT(*)::int AS order_count FROM orders WHERE store_id = $1 AND status = 'completed' AND created_at >= NOW() - INTERVAL '1 day' * $2",
      [storeId, days]
    );
    const itemsRes = await db.query(
      "SELECT COALESCE(SUM(oi.quantity),0)::int AS items_sold FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.store_id = $1 AND o.status = 'completed' AND o.created_at >= NOW() - INTERVAL '1 day' * $2",
      [storeId, days]
    );
    const refundsRes = await db.query(
      "SELECT COALESCE(SUM(r.amount),0) AS refunded FROM refunds r JOIN orders o ON o.id = r.order_id WHERE o.store_id = $1 AND o.created_at >= NOW() - INTERVAL '1 day' * $2",
      [storeId, days]
    );
    const revenue = Number(ordersRes.rows[0].revenue || 0);
    const orderCount = Number(ordersRes.rows[0].order_count || 0);
    res.json({
      revenue,
      order_count: orderCount,
      avg_order: orderCount > 0 ? revenue / orderCount : 0,
      items_sold: Number(itemsRes.rows[0].items_sold || 0),
      refunded: Number(refundsRes.rows[0].refunded || 0),
    });
  } catch (error) {
    console.error("Analytics summary error:", error);
    res.status(500).json({ error: "Failed to fetch summary." });
  }
});

router.get("/top-products", async (req, res) => {
  try {
    const days = getDays(req);
    const result = await db.query(
      "SELECT p.name, SUM(oi.quantity)::int AS quantity, SUM(oi.total_price) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN variants v ON v.id = oi.variant_id JOIN products p ON p.id = v.product_id WHERE o.store_id = $1 AND o.status = 'completed' AND o.created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY p.name ORDER BY revenue DESC LIMIT 10",
      [req.user.storeId, days]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Top products error:", error);
    res.status(500).json({ error: "Failed to fetch top products." });
  }
});

router.get("/payments", async (req, res) => {
  try {
    const days = getDays(req);
    const result = await db.query(
      "SELECT pay.method, SUM(pay.amount) AS amount, COUNT(*)::int AS count FROM payments pay JOIN orders o ON o.id = pay.order_id WHERE o.store_id = $1 AND o.status = 'completed' AND o.created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY pay.method ORDER BY amount DESC",
      [req.user.storeId, days]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Payments report error:", error);
    res.status(500).json({ error: "Failed to fetch payments report." });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const days = getDays(req);
    const result = await db.query(
      "SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(oi.total_price) AS revenue, SUM(oi.quantity)::int AS quantity FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN variants v ON v.id = oi.variant_id JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE o.store_id = $1 AND o.status = 'completed' AND o.created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY c.name ORDER BY revenue DESC",
      [req.user.storeId, days]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Categories report error:", error);
    res.status(500).json({ error: "Failed to fetch categories report." });
  }
});

router.get("/hourly", async (req, res) => {
  try {
    const days = getDays(req);
    const result = await db.query(
      "SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(total_amount) AS revenue, COUNT(*)::int AS order_count FROM orders WHERE store_id = $1 AND status = 'completed' AND created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY hour ORDER BY hour ASC",
      [req.user.storeId, days]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Hourly report error:", error);
    res.status(500).json({ error: "Failed to fetch hourly report." });
  }
});

router.get("/zreport", async (req, res) => {
  try {
    const days = getDays(req);
    const storeId = req.user.storeId;

    const salesRes = await db.query(
      "SELECT COALESCE(SUM(discount_amount),0) AS discounts, COALESCE(SUM(total_amount),0) AS net_sales, COALESCE(SUM(tax_amount),0) AS tax, COUNT(*)::int AS order_count FROM orders WHERE store_id = $1 AND status = 'completed' AND created_at >= NOW() - INTERVAL '1 day' * $2",
      [storeId, days]
    );

    const itemsRes = await db.query(
      "SELECT COALESCE(SUM(oi.quantity),0)::int AS items_sold FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.store_id = $1 AND o.status = 'completed' AND o.created_at >= NOW() - INTERVAL '1 day' * $2",
      [storeId, days]
    );

    const refundsRes = await db.query(
      "SELECT COALESCE(SUM(r.amount),0) AS refunded FROM refunds r JOIN orders o ON o.id = r.order_id WHERE o.store_id = $1 AND o.created_at >= NOW() - INTERVAL '1 day' * $2",
      [storeId, days]
    );

    const paymentsRes = await db.query(
      "SELECT pay.method, COALESCE(SUM(pay.amount),0) AS amount FROM payments pay JOIN orders o ON o.id = pay.order_id WHERE o.store_id = $1 AND o.status = 'completed' AND o.created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY pay.method",
      [storeId, days]
    );

    const cashRes = await db.query(
      "SELECT COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE 0 END),0) AS cash_in, COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END),0) AS cash_out FROM cash_movements WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2",
      [storeId, days]
    );

    const storeRes = await db.query("SELECT tax_inclusive, tax_rate FROM stores WHERE id = $1", [storeId]);
	const diningRes = await db.query(
      "SELECT dining_option, COALESCE(SUM(total_amount),0) AS amount, COUNT(*)::int AS count FROM orders WHERE store_id = $1 AND status = 'completed' AND created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY dining_option",
      [storeId, days]
    );

    const s = salesRes.rows[0];
    const discounts = Number(s.discounts || 0);
    const net = Number(s.net_sales || 0);
    const gross = net + discounts;
    const taxAmount = Number(s.tax || 0);
    const orderCount = Number(s.order_count || 0);
    const itemsSold = Number(itemsRes.rows[0].items_sold || 0);
    const refunded = Number(refundsRes.rows[0].refunded || 0);
    const cashIn = Number(cashRes.rows[0].cash_in || 0);
    const cashOut = Number(cashRes.rows[0].cash_out || 0);

    let cashSales = 0;
    let cardSales = 0;
    paymentsRes.rows.forEach((p) => {
      if (p.method === "cash") cashSales += Number(p.amount || 0);
      else cardSales += Number(p.amount || 0);
    });

    const expectedCash = cashSales - refunded + cashIn - cashOut;

    res.json({
      gross_sales: gross,
      discounts,
      net_sales: net,
      tax_amount: taxAmount,
      vat_mode: storeRes.rows[0] && storeRes.rows[0].tax_inclusive ? "incl" : "excl",
      tax_rate: storeRes.rows[0] ? Number(storeRes.rows[0].tax_rate || 0) : 0,
      refunds: refunded,
      order_count: orderCount,
      items_sold: itemsSold,
      avg_order: orderCount > 0 ? net / orderCount : 0,
      cash_sales: cashSales,
      card_sales: cardSales,
	  dining: diningRes.rows.map((r) => ({ dining_option: r.dining_option, amount: Number(r.amount || 0), count: Number(r.count || 0) })),
      cash_in: cashIn,
      cash_out: cashOut,
      expected_cash: expectedCash,
    });
  } catch (error) {
    console.error("Z-report error:", error);
    res.status(500).json({ error: "Failed to fetch Z-report." });
  }
});

module.exports = router;
