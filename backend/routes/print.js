const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// POST /api/print/jobs — POS creates a print job
router.post("/jobs", async (req, res) => {
  try {
    const { printer_name, content } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required." });

    const result = await db.query(
      "INSERT INTO print_jobs (store_id, printer_name, content, status) VALUES ($1, $2, $3, 'pending') RETURNING id",
      [req.user.storeId, printer_name || "default", content]
    );
    res.json({ id: result.rows[0].id, status: "pending" });
  } catch (e) {
    console.error("Print job create error:", e);
    res.status(500).json({ error: "Failed to create print job." });
  }
});

// GET /api/print/jobs/pending — Agent polls for jobs to print
router.get("/jobs/pending", async (req, res) => {
  try {
    const agent = req.query.agent || null;
    const params = [req.user.storeId];
    let sql = "SELECT id, printer_name, content, created_at FROM print_jobs WHERE store_id = $1 AND status = 'pending' AND attempts < 3";
    if (agent) { params.push(agent); sql += " AND printer_name = $" + params.length; }
    sql += " ORDER BY created_at ASC LIMIT 5";
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (e) {
    console.error("Print jobs poll error:", e);
    res.status(500).json({ error: "Failed to fetch pending jobs." });
  }
});

// POST /api/print/jobs/:id/claim — Agent claims a job before printing
router.post("/jobs/:id/claim", async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE print_jobs SET status = 'printing', claimed_at = NOW(), attempts = attempts + 1 WHERE id = $1 AND store_id = $2 AND status = 'pending' RETURNING id",
      [req.params.id, req.user.storeId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Job not found or already claimed." });
    res.json({ success: true });
  } catch (e) {
    console.error("Print job claim error:", e);
    res.status(500).json({ error: "Failed to claim job." });
  }
});

// POST /api/print/jobs/:id/done — Agent marks job as successfully printed
router.post("/jobs/:id/done", async (req, res) => {
  try {
    await db.query(
      "UPDATE print_jobs SET status = 'done', processed_at = NOW() WHERE id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("Print job done error:", e);
    res.status(500).json({ error: "Failed to mark job done." });
  }
});

// POST /api/print/jobs/:id/failed — Agent marks job as failed
router.post("/jobs/:id/failed", async (req, res) => {
  try {
    const { error } = req.body || {};
    await db.query(
      "UPDATE print_jobs SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END, error_message = $3, processed_at = NOW() WHERE id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId, error || "Unknown error"]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("Print job failed error:", e);
    res.status(500).json({ error: "Failed to mark job failed." });
  }
});

module.exports = router;