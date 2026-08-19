const { Pool } = require("pg");

const isNeon = process.env.DATABASE_URL && process.env.DATABASE_URL.includes("neon.tech");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

// This prevents the backend from crashing when Neon drops a connection
pool.on("error", (err) => {
  console.error("🔌 Ignored idle client error:", err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(), // 👈 THIS IS THE FIX!
  pool,
};