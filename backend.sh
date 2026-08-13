#!/usr/bin/env bash
set -e

echo "Writing backend code files..."

# -------------------------------------------------
# db.js
# -------------------------------------------------
cat > yourpos/backend/db.js <<'EOF'
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
EOF

# -------------------------------------------------
# middleware/auth.js
# -------------------------------------------------
cat > yourpos/backend/middleware/auth.js <<'EOF'
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

module.exports = authenticateToken;
EOF

# -------------------------------------------------
# server.js
# -------------------------------------------------
cat > yourpos/backend/server.js <<'EOF'
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const categoriesRoutes = require("./routes/categories");
const inventoryRoutes = require("./routes/inventory");
const syncRoutes = require("./routes/sync");
const ordersRoutes = require("./routes/orders");
const analyticsRoutes = require("./routes/analytics");

const app = express();

app.use(helmet());

const allowedOrigins = [
  process.env.CLIENT_ORIGIN,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:19006",
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});

app.use(globalLimiter);
app.use("/api/auth", authLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
EOF

# -------------------------------------------------
# routes/auth.js
# -------------------------------------------------
cat > yourpos/backend/routes/auth.js <<'EOF'
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
      "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at",
      [normalizedEmail, passwordHash, name, "owner"]
    );

    const user = userResult.rows[0];

    const storeResult = await client.query(
      "INSERT INTO stores (owner_id, name, currency, tax_rate) VALUES ($1, $2, $3, $4) RETURNING id, name, currency, tax_rate",
      [user.id, storeName, "USD", 0]
    );

    const store = storeResult.rows[0];

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

    const result = await db.query(
      "SELECT u.id, u.email, u.password_hash, u.name, u.role, u.created_at, s.id AS store_id, s.name AS store_name, s.currency, s.tax_rate FROM users u LEFT JOIN stores s ON s.owner_id = u.id WHERE u.email = $1 LIMIT 1",
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const row = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, row.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = { id: row.id, email: row.email, name: row.name, role: row.role, created_at: row.created_at };

    const store = row.store_id
      ? { id: row.store_id, name: row.store_name, currency: row.currency, tax_rate: row.tax_rate }
      : null;

    if (!store) {
      return res.status(403).json({ error: "No store found for this account." });
    }

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

    const storeResult = await db.query(
      "SELECT id, name, currency, tax_rate FROM stores WHERE owner_id = $1 ORDER BY id ASC LIMIT 1",
      [userId]
    );

    const store = storeResult.rows.length > 0 ? storeResult.rows[0] : null;

    res.json({ user: sanitizeUser(user), store });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ error: "Failed to fetch user profile." });
  }
});

module.exports = router;
EOF

# -------------------------------------------------
# routes/categories.js
# -------------------------------------------------
cat > yourpos/backend/routes/categories.js <<'EOF'
const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, color FROM categories WHERE store_id = $1 ORDER BY name ASC",
      [req.user.storeId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories." });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const color = String(req.body.color || "#CCCCCC").trim();

    if (!name) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const result = await db.query(
      "INSERT INTO categories (store_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color",
      [req.user.storeId, name, color]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ error: "Failed to create category." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const color = String(req.body.color || "#CCCCCC").trim();

    if (!name) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const result = await db.query(
      "UPDATE categories SET name = $1, color = $2 WHERE id = $3 AND store_id = $4 RETURNING id, name, color",
      [name, color, req.params.id, req.user.storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ error: "Failed to update category." });
  }
});

router.delete("/:id", async (req, res) => {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE products SET category_id = NULL WHERE category_id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId]
    );

    const result = await client.query(
      "DELETE FROM categories WHERE id = $1 AND store_id = $2",
      [req.params.id, req.user.storeId]
    );

    await client.query("COMMIT");

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete category error:", error);
    res.status(500).json({ error: "Failed to delete category." });
  } finally {
    client.release();
  }
});

module.exports = router;
EOF

# -------------------------------------------------
# routes/inventory.js
# -------------------------------------------------
cat > yourpos/backend/routes/inventory.js <<'EOF'
const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

function toNullIfEmpty(value) {
  if (value === undefined || value === null) return null;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function parsePrice(value) {
  const price = Number(value);
  if (Number.isNaN(price) || price < 0) return null;
  return price;
}

function parseStock(value) {
  const stock = Number(value);
  if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) return null;
  return stock;
}

function validateVariants(variants) {
  if (!Array.isArray(variants)) return { error: "Variants must be an array." };

  const cleaned = [];

  for (const variant of variants) {
    const price = parsePrice(variant.price);
    if (price === null) return { error: "Each variant price must be a valid number." };

    const stock = parseStock(variant.stock_quantity === undefined ? 0 : variant.stock_quantity);
    if (stock === null) return { error: "Each variant stock must be a valid whole number." };

    cleaned.push({
      id: variant.id ? Number(variant.id) : null,
      name: toNullIfEmpty(variant.name) || "Default",
      sku: toNullIfEmpty(variant.sku),
      barcode: toNullIfEmpty(variant.barcode),
      price,
      stock,
    });
  }

  return { variants: cleaned };
}

router.get("/lookup", async (req, res) => {
  try {
    const barcode = toNullIfEmpty(req.query.barcode);

    if (!barcode) {
      return res.status(400).json({ error: "Barcode is required." });
    }

    const result = await db.query(
      "SELECT p.id AS product_id, p.name AS product_name, v.id AS variant_id, v.name AS variant_name, v.sku, v.barcode, v.price, v.stock_quantity FROM variants v JOIN products p ON p.id = v.product_id WHERE p.store_id = $1 AND p.is_available = true AND v.is_available = true AND (v.barcode = $2 OR v.sku = $2) ORDER BY v.id ASC LIMIT 1",
      [req.user.storeId, barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No product found for this barcode." });
    }

    const row = result.rows[0];

    res.json({
      product_id: row.product_id,
      product_name: row.product_name,
      variant: {
        id: row.variant_id,
        name: row.variant_name,
        sku: row.sku,
        barcode: row.barcode,
        price: Number(row.price || 0),
        stock_quantity: Number(row.stock_quantity || 0),
      },
    });
  } catch (error) {
    console.error("Barcode lookup error:", error);
    res.status(500).json({ error: "Failed to lookup barcode." });
  }
});

router.get("/products", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const search = toNullIfEmpty(req.query.search);

    const params = [storeId];

    let productQuery =
      "SELECT p.id, p.name, p.image_url, p.category_id, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.store_id = $1 AND p.is_available = true";

    if (search) {
      params.push("%" + search + "%");
      productQuery +=
        " AND (p.name ILIKE $2 OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND (v.sku ILIKE $2 OR v.barcode ILIKE $2)))";
    }

    productQuery += " ORDER BY p.name ASC";

    const productsResult = await db.query(productQuery, params);

    const productIds = productsResult.rows.map((row) => row.id);

    const variantsByProduct = {};

    if (productIds.length > 0) {
      const variantsResult = await db.query(
        "SELECT id, product_id, name, sku, barcode, price, stock_quantity FROM variants WHERE product_id = ANY($1) AND is_available = true ORDER BY id ASC",
        [productIds]
      );

      variantsResult.rows.forEach((variant) => {
        if (!variantsByProduct[variant.product_id]) {
          variantsByProduct[variant.product_id] = [];
        }

        variantsByProduct[variant.product_id].push({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          barcode: variant.barcode,
          price: Number(variant.price || 0),
          stock_quantity: Number(variant.stock_quantity || 0),
        });
      });
    }

    const products = productsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      image_url: row.image_url,
      category_id: row.category_id,
      category_name: row.category_name,
      variants: variantsByProduct[row.id] || [],
    }));

    res.json(products);
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Failed to fetch products." });
  }
});

router.post("/products", async (req, res) => {
  const client = await db.getClient();

  try {
    const storeId = req.user.storeId;
    const name = toNullIfEmpty(req.body.name);

    if (!name) {
      return res.status(400).json({ error: "Product name is required." });
    }

    let variants = Array.isArray(req.body.variants) ? req.body.variants : [];

    if (variants.length === 0) {
      variants = [
        {
          name: "Default",
          price: req.body.price !== undefined ? req.body.price : 0,
          stock_quantity: req.body.stock_quantity !== undefined ? req.body.stock_quantity : 0,
          sku: req.body.sku,
          barcode: req.body.barcode,
        },
      ];
    }

    const validation = validateVariants(variants);

    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    await client.query("BEGIN");

    const productResult = await client.query(
      "INSERT INTO products (store_id, category_id, name, image_url, is_available) VALUES ($1, $2, $3, $4, true) RETURNING id",
      [storeId, req.body.category_id || null, name, toNullIfEmpty(req.body.image_url)]
    );

    const productId = productResult.rows[0].id;

    for (const variant of validation.variants) {
      await client.query(
        "INSERT INTO variants (product_id, name, sku, barcode, price, stock_quantity, is_available) VALUES ($1, $2, $3, $4, $5, $6, true)",
        [productId, variant.name, variant.sku, variant.barcode, variant.price, variant.stock]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({ success: true, product_id: productId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create product error:", error);
    res.status(500).json({ error: "Failed to create product." });
  } finally {
    client.release();
  }
});

router.put("/products/:id", async (req, res) => {
  const client = await db.getClient();

  try {
    const storeId = req.user.storeId;
    const productId = req.params.id;
    const name = toNullIfEmpty(req.body.name);

    if (!name) {
      return res.status(400).json({ error: "Product name is required." });
    }

    const existingProduct = await client.query(
      "SELECT id FROM products WHERE id = $1 AND store_id = $2",
      [productId, storeId]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    let variantsPayload = null;

    if (Array.isArray(req.body.variants)) {
      const validation = validateVariants(req.body.variants);

      if (validation.error) {
        return res.status(400).json({ error: validation.error });
      }

      variantsPayload = validation.variants;
    }

    await client.query("BEGIN");

    await client.query(
      "UPDATE products SET name = $1, image_url = $2, category_id = $3, updated_at = NOW() WHERE id = $4 AND store_id = $5",
      [name, toNullIfEmpty(req.body.image_url), req.body.category_id || null, productId, storeId]
    );

    if (variantsPayload) {
      const existingVariants = await client.query("SELECT id FROM variants WHERE product_id = $1", [productId]);

      const existingIds = existingVariants.rows.map((row) => row.id);
      const providedIds = variantsPayload.filter((v) => v.id).map((v) => v.id);

      for (const variant of variantsPayload) {
        if (variant.id) {
          await client.query(
            "UPDATE variants SET name = $1, sku = $2, barcode = $3, price = $4, stock_quantity = $5, is_available = true, updated_at = NOW() WHERE id = $6 AND product_id = $7",
            [variant.name, variant.sku, variant.barcode, variant.price, variant.stock, variant.id, productId]
          );
        } else {
          await client.query(
            "INSERT INTO variants (product_id, name, sku, barcode, price, stock_quantity, is_available) VALUES ($1, $2, $3, $4, $5, $6, true)",
            [productId, variant.name, variant.sku, variant.barcode, variant.price, variant.stock]
          );
        }
      }

      const removedIds = existingIds.filter((id) => !providedIds.includes(id));

      if (removedIds.length > 0) {
        await client.query("UPDATE variants SET is_available = false WHERE id = ANY($1)", [removedIds]);
      }
    }

    await client.query("COMMIT");

    res.json({ success: true, product_id: productId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update product error:", error);
    res.status(500).json({ error: "Failed to update product." });
  } finally {
    client.release();
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const productId = req.params.id;

    const existingProduct = await db.query(
      "SELECT id FROM products WHERE id = $1 AND store_id = $2",
      [productId, storeId]
    );

    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    await db.query(
      "UPDATE products SET is_available = false, updated_at = NOW() WHERE id = $1 AND store_id = $2",
      [productId, storeId]
    );

    await db.query("UPDATE variants SET is_available = false, updated_at = NOW() WHERE product_id = $1", [productId]);

    res.json({ success: true });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ error: "Failed to delete product." });
  }
});

module.exports = router;
EOF

# -------------------------------------------------
# routes/sync.js
# -------------------------------------------------
cat > yourpos/backend/routes/sync.js <<'EOF'
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

      if (!order.client_order_id) {
        throw new Error("client_order_id is required.");
      }

      const existingOrder = await client.query(
        "SELECT id FROM orders WHERE client_order_id = $1",
        [order.client_order_id]
      );

      if (existingOrder.rows.length > 0) {
        results.push({
          client_order_id: order.client_order_id,
          order_id: existingOrder.rows[0].id,
          already_synced: true,
        });
        await client.query("COMMIT");
        continue;
      }

      const subtotal = Number(order.subtotal || 0);
      const taxAmount = Number(order.tax_amount || 0);
      const totalAmount = Number(order.total_amount || 0);

      const paymentMethod = ["cash", "card", "split"].includes(order.payment_method)
        ? order.payment_method
        : "cash";

      const amountTendered =
        order.amount_tendered === null || order.amount_tendered === undefined
          ? null
          : Number(order.amount_tendered);

      const changeDue =
        order.change_due === null || order.change_due === undefined
          ? null
          : Number(order.change_due);

      const orderResult = await client.query(
        "INSERT INTO orders (client_order_id, store_id, cashier_id, subtotal, tax_amount, total_amount, status, is_synced, created_at, payment_method, amount_tendered, change_due, refunded_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, 0) RETURNING id",
        [
          order.client_order_id,
          req.user.storeId,
          order.cashier_id || req.user.sub,
          subtotal,
          taxAmount,
          totalAmount,
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

          await client.query(
            "INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)",
            [newOrderId, variantId, quantity, unitPrice, totalPrice]
          );

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
        const paymentMethodValue = ["cash", "card", "split"].includes(payment.method)
          ? payment.method
          : "cash";

        const paymentAmount = Number(payment.amount || 0);

        if (paymentAmount <= 0) continue;

        await client.query(
          "INSERT INTO payments (order_id, method, amount) VALUES ($1, $2, $3)",
          [newOrderId, paymentMethodValue, paymentAmount]
        );
      }

      results.push({
        client_order_id: order.client_order_id,
        order_id: newOrderId,
        already_synced: false,
      });

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
EOF

# -------------------------------------------------
# routes/orders.js
# -------------------------------------------------
cat > yourpos/backend/routes/orders.js <<'EOF'
const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isNaN(requestedLimit) ? 50 : requestedLimit, 100);

    const result = await db.query(
      "SELECT o.id, o.client_order_id, o.created_at, o.status, o.subtotal, o.tax_amount, o.total_amount, o.payment_method, o.amount_tendered, o.change_due, o.refunded_amount, COUNT(oi.id)::int AS item_count FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE o.store_id = $1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2",
      [storeId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;

    const orderResult = await db.query(
      "SELECT id, client_order_id, cashier_id, created_at, status, subtotal, tax_amount, total_amount, payment_method, amount_tendered, change_due, refunded_amount FROM orders WHERE id = $1 AND store_id = $2",
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderResult.rows[0];

    const itemsResult = await db.query(
      "SELECT oi.id, oi.quantity, oi.unit_price, oi.total_price, v.id AS variant_id, v.name AS variant_name, p.name AS product_name FROM order_items oi JOIN variants v ON v.id = oi.variant_id JOIN products p ON p.id = v.product_id WHERE oi.order_id = $1 ORDER BY oi.id ASC",
      [orderId]
    );

    const paymentsResult = await db.query(
      "SELECT id, method, amount, created_at FROM payments WHERE order_id = $1 ORDER BY id ASC",
      [orderId]
    );

    const refundsResult = await db.query(
      "SELECT id, amount, reason, created_by, created_at FROM refunds WHERE order_id = $1 ORDER BY id ASC",
      [orderId]
    );

    res.json({
      order,
      items: itemsResult.rows,
      payments: paymentsResult.rows,
      refunds: refundsResult.rows,
    });
  } catch (error) {
    console.error("Get order detail error:", error);
    res.status(500).json({ error: "Failed to fetch order details." });
  }
});

router.post("/:id/refund", async (req, res) => {
  const client = await db.getClient();

  try {
    const orderId = req.params.id;
    const storeId = req.user.storeId;
    const reason = req.body.reason || "Full refund";

    await client.query("BEGIN");

    const orderResult = await client.query(
      "SELECT id, total_amount, refunded_amount, status FROM orders WHERE id = $1 AND store_id = $2 FOR UPDATE",
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderResult.rows[0];

    if (order.status === "refunded") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Order is already refunded." });
    }

    const totalAmount = Number(order.total_amount || 0);
    const refundedAmount = Number(order.refunded_amount || 0);
    const remainingAmount = totalAmount - refundedAmount;

    if (remainingAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Order has already been fully refunded." });
    }

    const refundAmount = remainingAmount;

    await client.query(
      "INSERT INTO refunds (order_id, amount, reason, created_by) VALUES ($1, $2, $3, $4)",
      [orderId, refundAmount, reason, req.user.sub]
    );

    await client.query(
      "UPDATE orders SET refunded_amount = refunded_amount + $1, status = 'refunded', updated_at = NOW() WHERE id = $2",
      [refundAmount, orderId]
    );

    await client.query(
      "UPDATE variants v SET stock_quantity = v.stock_quantity + oi.quantity, updated_at = NOW() FROM order_items oi WHERE oi.order_id = $1 AND oi.variant_id = v.id",
      [orderId]
    );

    await client.query("COMMIT");

    res.json({ success: true, refunded_amount: refundAmount });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Refund error:", error);
    res.status(500).json({ error: "Failed to refund order." });
  } finally {
    client.release();
  }
});

module.exports = router;
EOF

# -------------------------------------------------
# routes/analytics.js
# -------------------------------------------------
cat > yourpos/backend/routes/analytics.js <<'EOF'
const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get("/sales", authenticateToken, async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const days = parseInt(req.query.days, 10) || 31;

    const result = await db.query(
      "SELECT DATE(created_at) AS date, SUM(total_amount) AS revenue, COUNT(id) AS order_count FROM orders WHERE status = 'completed' AND store_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2 GROUP BY DATE(created_at) ORDER BY DATE(created_at) ASC",
      [storeId, days]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics." });
  }
});

module.exports = router;
EOF

echo "======================================"
echo " BACKEND CODE COMPLETE"
echo "======================================"
echo ""
echo "Next steps:"
echo "  cd yourpos/backend"
echo "  cp .env.example .env   (then edit DATABASE_URL and JWT_SECRET)"
echo "  npm install"
echo "  npm run dev"
echo "  Open: http://localhost:4000/health"