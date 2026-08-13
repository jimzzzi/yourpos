const express = require("express");
const db = require("../db");
const bcrypt = require("bcryptjs");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

const RIGHTS = ["sales", "refunds", "discounts", "items", "receipts", "reports", "cash", "settings", "users"];

async function loadAuth(userId) {
  const r = await db.query(
    "SELECT u.is_owner, g.permissions FROM users u LEFT JOIN user_groups g ON g.id = u.group_id WHERE u.id = $1",
    [userId]
  );
  const row = r.rows[0] || { is_owner: true, permissions: [] };
  return { is_owner: Boolean(row.is_owner), permissions: row.permissions || [] };
}

async function requireManage(req, res) {
  const auth = await loadAuth(req.user.id || req.user.sub);
  if (!auth.is_owner && !auth.permissions.includes("users")) {
    res.status(403).json({ error: "No permission." });
    return false;
  }
  return true;
}

router.get("/me", async (req, res) => {
  try {
   res.json(await loadAuth(req.user.id || req.user.sub));
  } catch (error) {
    console.error("me error:", error);
    res.status(500).json({ error: "Failed." });
  }
});

router.get("/groups", async (req, res) => {
  try {
    const r = await db.query("SELECT id, name, permissions FROM user_groups WHERE store_id = $1 ORDER BY id", [req.user.storeId]);
    res.json(r.rows);
  } catch (error) {
    console.error("groups error:", error);
    res.status(500).json({ error: "Failed." });
  }
});

router.post("/groups", async (req, res) => {
  try {
    if (!(await requireManage(req, res))) return;
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Group name required." });
    const perms = (Array.isArray(req.body.permissions) ? req.body.permissions : []).filter((x) => RIGHTS.includes(x));
    const r = await db.query(
      "INSERT INTO user_groups (store_id, name, permissions) VALUES ($1, $2, $3) RETURNING id, name, permissions",
      [req.user.storeId, name, JSON.stringify(perms)]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    console.error("create group error:", error);
    res.status(500).json({ error: "Failed." });
  }
});
router.put("/groups/:id", async (req, res) => {
  try {
    if (!(await requireManage(req, res))) return;
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Group name required." });
    const perms = (Array.isArray(req.body.permissions) ? req.body.permissions : []).filter((x) => RIGHTS.includes(x));
    const r = await db.query(
      "UPDATE user_groups SET name = $1, permissions = $2 WHERE id = $3 AND store_id = $4 RETURNING id, name, permissions",
      [name, JSON.stringify(perms), req.params.id, req.user.storeId]
    );
    res.json(r.rows[0]);
  } catch (error) {
    console.error("update group error:", error);
    res.status(500).json({ error: "Failed." });
  }
});

router.delete("/groups/:id", async (req, res) => {
  try {
    if (!(await requireManage(req, res))) return;
    await db.query("UPDATE users SET group_id = NULL WHERE group_id = $1 AND store_id = $2", [req.params.id, req.user.storeId]);
    await db.query("DELETE FROM user_groups WHERE id = $1 AND store_id = $2", [req.params.id, req.user.storeId]);
    res.json({ success: true });
  } catch (error) {
    console.error("delete group error:", error);
    res.status(500).json({ error: "Failed." });
  }
});

router.get("/", async (req, res) => {
  try {
    const r = await db.query(
      "SELECT u.id, u.name, u.email, u.is_owner, u.group_id, g.name AS group_name FROM users u LEFT JOIN user_groups g ON g.id = u.group_id WHERE u.store_id = $1 ORDER BY u.id",
      [req.user.storeId]
    );
    res.json(r.rows);
  } catch (error) {
    console.error("🔥 USERS GET ERROR:", error.message);
    res.status(500).json({ error: "Failed." });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!(await requireManage(req, res))) return;
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!name || !email.includes("@") || password.length < 8) {
      return res.status(400).json({ error: "Valid name, email & 8+ char password required." });
    }
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      "INSERT INTO users (name, email, password_hash, store_id, group_id, is_owner, role) VALUES ($1, $2, $3, $4, $5, false, 'staff') RETURNING id, name, email",
      [name, email, hash, req.user.storeId, req.body.group_id || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Email already in use." });
    console.error("create user error:", error);
    res.status(500).json({ error: "Failed." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    if (!(await requireManage(req, res))) return;
    const sets = [];
    const params = [];
    
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (name) {
        params.push(name);
        sets.push("name = $" + params.length);
      }
    }
    
    if (req.body.email !== undefined) {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (email && email.includes("@")) {
        params.push(email);
        sets.push("email = $" + params.length);
      }
    }
    
    if (req.body.group_id !== undefined) {
      params.push(req.body.group_id || null);
      sets.push("group_id = $" + params.length);
    }
    
    if (req.body.password) {
      const hash = await bcrypt.hash(String(req.body.password), 10);
      params.push(hash);
      sets.push("password_hash = $" + params.length);
    }
    
    if (sets.length === 0) return res.json({ success: true });
    params.push(req.params.id, req.user.storeId);
    await db.query(
      "UPDATE users SET " + sets.join(", ") + " WHERE id = $" + (params.length - 1) + " AND store_id = $" + params.length,
      params
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Email already in use." });
    console.error("update user error:", error);
    res.status(500).json({ error: "Failed." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!(await requireManage(req, res))) return;
    const target = await db.query("SELECT is_owner FROM users WHERE id = $1 AND store_id = $2", [req.params.id, req.user.storeId]);
    if (target.rows.length === 0) return res.status(404).json({ error: "Not found." });
    if (target.rows[0].is_owner) return res.status(400).json({ error: "Cannot delete owner." });
    if (Number(req.params.id) === Number(req.user.id || req.user.sub)) return res.status(400).json({ error: "Cannot delete yourself." });
    await db.query("DELETE FROM users WHERE id = $1 AND store_id = $2", [req.params.id, req.user.storeId]);
    res.json({ success: true });
  } catch (error) {
    console.error("delete user error:", error);
    res.status(500).json({ error: "Failed." });
  }
});

module.exports = router;