const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

const statsSql = `
  SELECT COUNT(*) FILTER (WHERE status <> 'refunded')::int AS orders,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_amount ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN discount_amount ELSE 0 END), 0) AS disc,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN tax_amount ELSE 0 END), 0) AS tax,
         COALESCE(SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END), 0) AS refunds
  FROM orders
  WHERE store_id = $1
    AND created_at >= $2
    AND ($3::timestamptz IS NULL OR created_at < $3)
`;

const dailySql = `
  SELECT TO_CHAR(DATE(created_at), 'MM-DD') AS label,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_amount ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN discount_amount ELSE 0 END), 0) AS discounts,
         COUNT(*) FILTER (WHERE status <> 'refunded')::int AS orders
  FROM orders
  WHERE store_id = $1
    AND created_at >= $2
    AND ($3::timestamptz IS NULL OR created_at < $3)
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
    const days = Math.min(365, Math.max(1, Number(req.query.days || 7)));
    const storeId = req.user.storeId;
    const openStr = req.query.open || null;

    const now = new Date();
    const startCur = new Date(now);
    if (openStr) {
      // Business day starts at opening time (e.g. 08:00), not midnight
      const parts = String(openStr).split(":");
      startCur.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
      if (now < startCur) startCur.setDate(startCur.getDate() - 1); // after midnight → still yesterday's shift
    } else {
      startCur.setHours(0, 0, 0, 0);
    }
    if (days > 1) startCur.setDate(startCur.getDate() - (days - 1));
    const startPrev = new Date(startCur);
    startPrev.setDate(startPrev.getDate() - days);

    const [curRow] = (await db.query(statsSql, [storeId, startCur.toISOString(), null])).rows;
    const [prevRow] = (await db.query(statsSql, [storeId, startPrev.toISOString(), startCur.toISOString()])).rows;
    const daily = (await db.query(dailySql, [storeId, startCur.toISOString(), null])).rows;

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
    });
  } catch (error) {
    console.error("dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard." });
  }
});

module.exports = router;