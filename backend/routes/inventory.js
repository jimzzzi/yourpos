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

function parseTrackStock(value) {
  if (value === undefined || value === null) return false;
  return Boolean(value);
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
      "SELECT p.id, p.name, p.image_url, p.description, p.track_stock, p.category_id, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.store_id = $1 AND p.is_available = true";
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
      description: row.description,
      track_stock: Boolean(row.track_stock),
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
      "INSERT INTO products (store_id, category_id, name, image_url, description, track_stock, is_available) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id",
      [storeId, req.body.category_id || null, name, toNullIfEmpty(req.body.image_url), toNullIfEmpty(req.body.description), parseTrackStock(req.body.track_stock)]
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
      "UPDATE products SET name = $1, image_url = $2, description = $3, track_stock = $4, category_id = $5, updated_at = NOW() WHERE id = $6 AND store_id = $7",
      [name, toNullIfEmpty(req.body.image_url), toNullIfEmpty(req.body.description), parseTrackStock(req.body.track_stock), req.body.category_id || null, productId, storeId]
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