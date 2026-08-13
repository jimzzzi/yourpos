const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

function generateToken(user, storeId) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, storeId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function sanitizeUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, created_at: user.created_at };
}

router.post("/register", async (req, res) => {
  const client = await db.getClient();

  try {
    const { name, email, password, storeName } = req.body;

    if (!name || !email || !password || !storeName) {
      return res.status(400).json({ error: "Name, email, password and store name are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }

    const existingUser = await client.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");

    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, name, role, is_owner) VALUES ($1, $2, $3, $4, true) RETURNING id, email, name, role, created_at",
      [normalizedEmail, passwordHash, name, "owner"]
    );

    const user = userResult.rows[0];

    const storeResult = await client.query(
      "INSERT INTO stores (owner_id, name, currency, tax_rate) VALUES ($1, $2, $3, $4) RETURNING id, name, currency, tax_rate",
      [user.id, storeName, "USD", 0]
    );

    const store = storeResult.rows[0];

    // Link the owner to their store
    await client.query("UPDATE users SET store_id = $1 WHERE id = $2", [store.id, user.id]);

    await client.query("COMMIT");

    const token = generateToken(user, store.id);

    res.status(201).json({ token, user: sanitizeUser(user), store });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find the user first
    const userResult = await db.query(
      "SELECT id, email, password_hash, name, role, created_at FROM users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const row = userResult.rows[0];

    const isValidPassword = await bcrypt.compare(password, row.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = { id: row.id, email: row.email, name: row.name, role: row.role, created_at: row.created_at };

    // Try to find store for staff users (users.store_id)
    let storeResult = await db.query(
      "SELECT s.id, s.name, s.currency, s.tax_rate FROM stores s JOIN users u ON u.store_id = s.id WHERE u.id = $1",
      [user.id]
    );

    // If not found, try owner way (stores.owner_id)
    if (storeResult.rows.length === 0) {
      storeResult = await db.query(
        "SELECT id, name, currency, tax_rate FROM stores WHERE owner_id = $1",
        [user.id]
      );
    }

    if (storeResult.rows.length === 0) {
      return res.status(403).json({ error: "No store found for this account." });
    }

    const store = storeResult.rows[0];

    const token = generateToken(user, store.id);

    res.json({ token, user: sanitizeUser(user), store });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const userResult = await db.query(
      "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = userResult.rows[0];

    // 1) Staff users: store comes from users.store_id
    let storeResult = await db.query(
      "SELECT s.* FROM stores s JOIN users u ON u.store_id = s.id WHERE u.id = $1",
      [user.id]
    );
    // 2) Owners (old way): store.owner_id
    if (storeResult.rows.length === 0) {
      storeResult = await db.query("SELECT * FROM stores WHERE owner_id = $1", [user.id]);
    }
    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: "No store found for this account." });
    }

    const store = storeResult.rows[0];

    res.json({ user: sanitizeUser(user), store });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ error: "Failed to fetch user profile." });
  }
});

module.exports = router;