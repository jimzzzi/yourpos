const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

async function sendTelegram(token, chatId, text) {
  const url = "https://api.telegram.org/bot" + token + "/sendMessage";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "Telegram API error");
  return data;
}

async function buildReport(storeId, days, symbol) {
  const store = await db.query("SELECT name, currency FROM stores WHERE id = $1", [storeId]);
  const storeName = store.rows[0] ? store.rows[0].name : "Store";
  const currency = symbol || "$";

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  let orders = 0, gross = 0, discounts = 0, refunds = 0;
  try {
    const stats = await db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status <> 'refunded')::int AS orders,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_amount ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN status <> 'refunded' THEN discount_amount ELSE 0 END), 0) AS discounts,
         COALESCE(SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END), 0) AS refunds
       FROM orders WHERE store_id = $1 AND created_at >= $2`,
      [storeId, start.toISOString()]
    );
    const r = stats.rows[0] || {};
    orders = Number(r.orders || 0);
    gross = Number(r.gross || 0);
    discounts = Number(r.discounts || 0);
    refunds = Number(r.refunds || 0);
  } catch (e) { console.error("Stats query failed:", e.message); }

  let payments = [];
  try {
    const p = await db.query(
      `SELECT payment_method, COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0) AS amount
       FROM orders WHERE store_id = $1 AND status <> 'refunded' AND created_at >= $2
       GROUP BY payment_method`,
      [storeId, start.toISOString()]
    );
    payments = p.rows || [];
  } catch (e) { console.error("Payments query failed:", e.message); }

  let cashIn = 0, cashOut = 0;
  try {
    const c = await db.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE 0 END), 0) AS cash_in,
         COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0) AS cash_out
       FROM cash_movements WHERE store_id = $1 AND created_at >= $2`,
      [storeId, start.toISOString()]
    );
    const r = c.rows[0] || {};
    cashIn = Number(r.cash_in || 0);
    cashOut = Number(r.cash_out || 0);
  } catch (e) { console.error("Cash query failed:", e.message); }

  let topProducts = [];
  try {
    const tp = await db.query(
      `SELECT COALESCE(oi.name, oi.product_name, 'Item') AS name, 
              SUM(oi.quantity) AS qty, 
              SUM(oi.quantity * COALESCE(oi.unit_price, oi.price, 0)) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = $1 AND o.status <> 'refunded' AND o.created_at >= $2
       GROUP BY 1 ORDER BY revenue DESC LIMIT 5`,
      [storeId, start.toISOString()]
    );
    topProducts = tp.rows || [];
  } catch (e) { console.error("Top products query failed:", e.message); }

  const net = gross - discounts;
  const avg = orders > 0 ? net / orders : 0;

  let msg = "<b>📊 " + storeName + " — Daily Report</b>\n";
  msg += "<i>" + now.toLocaleDateString() + "</i>\n\n";
  msg += "💰 <b>Gross:</b> " + currency + gross.toFixed(2) + "\n";
  msg += "💵 <b>Net:</b> " + currency + net.toFixed(2) + "\n";
  msg += "🛒 <b>Orders:</b> " + orders + " • Avg: " + currency + avg.toFixed(2) + "\n\n";

  if (payments.length > 0) {
    msg += "<b>💳 Payments:</b>\n";
    payments.forEach((p) => {
      msg += "  " + String(p.payment_method).toUpperCase() + ": " + currency + Number(p.amount).toFixed(2) + " (" + p.count + "x)\n";
    });
    msg += "\n";
  }

  msg += "🟢 <b>Cash In:</b> +" + currency + cashIn.toFixed(2) + "\n";
  msg += "🔴 <b>Cash Out:</b> -" + currency + cashOut.toFixed(2) + "\n\n";

  if (refunds > 0) msg += "❌ <b>Refunds:</b> " + currency + refunds.toFixed(2) + "\n";
  if (discounts > 0) msg += "🏷 <b>Discounts:</b> " + currency + discounts.toFixed(2) + "\n";

  if (topProducts.length > 0) {
    msg += "\n<b>🏆 Top Products:</b>\n";
    topProducts.forEach((p, i) => {
      msg += (i + 1) + ". " + p.name + " — " + currency + Number(p.revenue).toFixed(2) + " (" + p.qty + "x)\n";
    });
  }

  return msg;
}

router.post("/send", async (req, res) => {
  try {
    const store = await db.query("SELECT telegram_bot_token, telegram_chat_id FROM stores WHERE id = $1", [req.user.storeId]);
    const token = store.rows[0] ? store.rows[0].telegram_bot_token : null;
    const chatId = store.rows[0] ? store.rows[0].telegram_chat_id : null;

    if (!token || !chatId) {
      return res.status(400).json({ error: "Telegram not configured. Set bot token and chat ID in Settings." });
    }

    const days = Number(req.body.days || 1);
    const symbol = String(req.body.symbol || "").trim();
    const message = await buildReport(req.user.storeId, days, symbol);
    await sendTelegram(token, chatId, message);

    res.json({ success: true, message: "Report sent to Telegram!" });
  } catch (error) {
    console.error("Telegram send error:", error);
    res.status(500).json({ error: "Failed to send: " + error.message });
  }
});

router.post("/test", async (req, res) => {
  try {
    const store = await db.query("SELECT telegram_bot_token, telegram_chat_id FROM stores WHERE id = $1", [req.user.storeId]);
    const token = store.rows[0] ? store.rows[0].telegram_bot_token : null;
    const chatId = store.rows[0] ? store.rows[0].telegram_chat_id : null;

    if (!token || !chatId) {
      return res.status(400).json({ error: "Token and chat ID required." });
    }

    await sendTelegram(token, chatId, "✅ <b>Test message from YourPOS!</b>\nYour Telegram bot is working perfectly.");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/config", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const chatId = String(req.body.chatId || "").trim();

    await db.query(
      "UPDATE stores SET telegram_bot_token = $1, telegram_chat_id = $2 WHERE id = $3",
      [token, chatId, req.user.storeId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save config." });
  }
});

router.get("/config", async (req, res) => {
  try {
    const store = await db.query("SELECT telegram_bot_token, telegram_chat_id FROM stores WHERE id = $1", [req.user.storeId]);
    const row = store.rows[0] || {};
    res.json({
      token: row.telegram_bot_token || "",
      chatId: row.telegram_chat_id || "",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load config." });
  }
});

module.exports = router;