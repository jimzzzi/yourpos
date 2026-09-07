const express = require("express");
const db = require("../db");
const authenticateToken = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

// ========== GET: All recipes for store ==========
router.get("/", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    
    const result = await db.query(
      `SELECT 
        r.id,
        r.product_id,
        r.variant_id,
        r.is_active,
        p.name as product_name,
        v.name as variant_name,
        COALESCE(json_agg(
          json_build_object(
            'id', ri.id,
            'ingredient_id', ri.ingredient_id,
            'ingredient_name', i.name,
            'ingredient_unit', i.unit,
            'quantity_required', ri.quantity_required
          )
        ) FILTER (WHERE ri.id IS NOT NULL), '[]') as items
       FROM recipes r
       JOIN products p ON p.id = r.product_id
       LEFT JOIN variants v ON v.id = r.variant_id
       LEFT JOIN recipe_items ri ON ri.recipe_id = r.id
       LEFT JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE r.store_id = $1 AND r.is_active = true
       GROUP BY r.id, p.name, v.name
       ORDER BY p.name ASC`,
      [storeId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get recipes error:", error);
    res.status(500).json({ error: "Failed to fetch recipes." });
  }
});

// ========== GET: Recipe for specific product ==========
router.get("/product/:productId", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const productId = req.params.productId;
    const variantId = req.query.variant_id || null;

    const result = await db.query(
      `SELECT 
        r.id,
        r.product_id,
        r.variant_id,
        r.is_active,
        COALESCE(json_agg(
          json_build_object(
            'id', ri.id,
            'ingredient_id', ri.ingredient_id,
            'ingredient_name', i.name,
            'ingredient_unit', i.unit,
            'quantity_required', ri.quantity_required
          )
        ) FILTER (WHERE ri.id IS NOT NULL), '[]') as items
       FROM recipes r
       LEFT JOIN recipe_items ri ON ri.recipe_id = r.id
       LEFT JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE r.store_id = $1 AND r.product_id = $2 AND r.is_active = true
       GROUP BY r.id`,
      [storeId, productId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get product recipe error:", error);
    res.status(500).json({ error: "Failed to fetch recipe." });
  }
});

// ========== POST: Create/Update recipe ==========
router.post("/", async (req, res) => {
  const client = await db.getClient();
  try {
    const storeId = req.user.storeId;
    const { product_id, variant_id, items } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one ingredient is required." });
    }

    await client.query("BEGIN");

    // Check if recipe already exists
    let recipeResult;
    if (variant_id) {
      recipeResult = await client.query(
        `SELECT id FROM recipes WHERE store_id = $1 AND product_id = $2 AND variant_id = $3`,
        [storeId, product_id, variant_id]
      );
    } else {
      recipeResult = await client.query(
        `SELECT id FROM recipes WHERE store_id = $1 AND product_id = $2 AND variant_id IS NULL`,
        [storeId, product_id]
      );
    }

    let recipeId;

    if (recipeResult.rows.length > 0) {
      // Update existing recipe
      recipeId = recipeResult.rows[0].id;
      await client.query(
        `UPDATE recipes SET is_active = true, updated_at = NOW() WHERE id = $1`,
        [recipeId]
      );
      // Delete old recipe items
      await client.query(`DELETE FROM recipe_items WHERE recipe_id = $1`, [recipeId]);
    } else {
      // Create new recipe
      const newRecipe = await client.query(
        `INSERT INTO recipes (store_id, product_id, variant_id, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [storeId, product_id, variant_id || null]
      );
      recipeId = newRecipe.rows[0].id;
    }

    // Insert recipe items
    for (const item of items) {
      await client.query(
        `INSERT INTO recipe_items (recipe_id, ingredient_id, quantity_required)
         VALUES ($1, $2, $3)`,
        [recipeId, item.ingredient_id, item.quantity_required]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({ success: true, recipe_id: recipeId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create recipe error:", error);
    res.status(500).json({ error: "Failed to save recipe." });
  } finally {
    client.release();
  }
});

// ========== DELETE: Remove recipe ==========
router.delete("/:id", async (req, res) => {
  try {
    const storeId = req.user.storeId;
    const recipeId = req.params.id;

    await db.query(
      `UPDATE recipes SET is_active = false, updated_at = NOW() 
       WHERE id = $1 AND store_id = $2`,
      [recipeId, storeId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Delete recipe error:", error);
    res.status(500).json({ error: "Failed to delete recipe." });
  }
});

module.exports = router;