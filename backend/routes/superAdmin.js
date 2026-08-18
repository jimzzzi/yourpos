const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// Middleware: ONLY allow super_admins
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Access denied. Super Admins only." });
  }
  next();
};

router.use(authenticateToken);
router.use(requireSuperAdmin);

// GET /api/super-admin/stats (Global SaaS Metrics)
router.get("/stats", async (req, res) => {
  try {
    const totalStores = await db.query("SELECT COUNT(*) FROM stores");
    const totalOrders = await db.query("SELECT COUNT(*) FROM orders");
    const totalRevenue = await db.query("SELECT COALESCE(SUM(total), 0) FROM orders");
    
    // Orders created in the last 30 days
    const recentOrders = await db.query(
      "SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'"
    );

    res.json({
      totalStores: parseInt(totalStores.rows[0].count),
      totalOrders: parseInt(totalOrders.rows[0].count),
      totalRevenue: parseFloat(totalRevenue.rows[0].coalesce),
      recentOrders: parseInt(recentOrders.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/stores (List all your customers)
router.get("/stores", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.id, s.name, s.plan, s.monthly_order_limit, s.created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) as total_orders,
        (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.store_id = s.id) as total_revenue,
        (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND o.created_at >= date_trunc('month', CURRENT_DATE)) as orders_this_month
      FROM stores s
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/super-admin/stores/:id/plan (Upgrade/Downgrade a customer)
router.post("/stores/:id/plan", async (req, res) => {
  try {
    const { plan, limit } = req.body;
    await db.query(
      "UPDATE stores SET plan = $1, monthly_order_limit = $2 WHERE id = $3",
      [plan, limit, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;