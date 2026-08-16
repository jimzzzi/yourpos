const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// Helper: parse date range from query params
function parseDateRange(query) {
  const from = query.from;
  const to = query.to;
  
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }
  
  const days = Math.min(365, Math.max(1, Number(query.days || 7)));
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (days > 1) start.setDate(start.getDate() - (days - 1));
  return { from: start.toISOString(), to: now.toISOString() };
}

const statsSql = `
  SELECT COUNT(*) FILTER (WHERE status <> 'refunded')::int AS orders,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_amount ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN discount_amount ELSE 0 END), 0) AS disc,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN tax_amount ELSE 0 END), 0) AS tax,
         COALESCE(SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END), 0) AS refunds
  FROM orders
  WHERE store_id = $1
    AND created_at >= $2
    AND created_at <= $3
`;

const dailySql = `
  SELECT TO_CHAR(DATE(created_at), 'MM-DD') AS label,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_amount ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN discount_amount ELSE 0 END), 0) AS discounts,
         COUNT(*) FILTER (WHERE status <> 'refunded')::int AS orders
  FROM orders
  WHERE store_id = $1
    AND created_at >= $2
    AND created_at <= $3
  GROUP BY 1
  ORDER BY 1
`;

function shape(row) {
  const r = row || {};
  const gross = Number(r.gross || 0);
  const discounts = Number(r.disc || 0);
  const refunds = Number(r.refunds || 0);
  const order_count = Number(r.orders || 0);
  const tax = Number(r.tax || 0);
  const net = gross - discounts;
  return {
    gross_sales: gross,
    gross,
    discounts,
    refunds,
    order_count,
    orders: order_count,
    count: order_count,
    net_sales: net,
    net,
    tax_amount: tax,
    tax,
    avg: order_count > 0 ? net / order_count : 0,
  };
}

router.get("/dashboard", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const { from, to } = parseDateRange(req.query);
    
    // Calculate "previous period" for comparison
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const durationMs = toDate.getTime() - fromDate.getTime();
    const prevTo = new Date(fromDate.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - durationMs);
    
    const [curRow] = (await db.query(statsSql, [storeId, from, to])).rows;
    const [prevRow] = (await db.query(statsSql, [storeId, prevFrom.toISOString(), prevTo.toISOString()])).rows;
    const daily = (await db.query(dailySql, [storeId, from, to])).rows;
    
    const current = shape(curRow);
    const previous = shape(prevRow);
    
    res.json({
      current,
      previous,
      cur: current,
      prev: previous,
      daily: daily.map((d) => ({
        label: d.label,
        gross: Number(d.gross || 0),
        discounts: Number(d.discounts || 0),
        orders: Number(d.orders || 0),
      })),
      dateRange: { from, to },
    });
  } catch (error) {
    console.error("dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard." });
  }
});

module.exports = router;