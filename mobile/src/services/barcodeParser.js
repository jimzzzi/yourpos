// ========== SCALE BARCODE PARSER SERVICE ==========
// Supports all LS2MX predefined formats + custom formats

// ===== PREDEFINED FORMAT DEFINITIONS =====
// Each format defines field positions: { start, length, decimals }
// decimals: how many digits from the right are decimal places

export const PREDEFINED_FORMATS = {
  // ===== EAN13: 2-digit department (Types 00-09) =====
  ean13_t00: {
    name: "EAN13 Type 00 — Item Only",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 10 },
    price: null,
    weight: null,
  },
  ean13_t01: {
    name: "EAN13 Type 01 — Price (4)",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 6 },
    price: { start: 8, length: 4, decimals: 2 },
    weight: null,
  },
  ean13_t02: {
    name: "EAN13 Type 02 — Price (5) ⭐",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 5 },
    price: { start: 7, length: 5, decimals: 2 },
    weight: null,
  },
  ean13_t03: {
    name: "EAN13 Type 03 — Price (6)",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 4 },
    price: { start: 6, length: 6, decimals: 2 },
    weight: null,
  },
  ean13_t04: {
    name: "EAN13 Type 04 — Price (7)",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 3 },
    price: { start: 5, length: 7, decimals: 2 },
    weight: null,
  },
  ean13_t05: {
    name: "EAN13 Type 05 — Weight Q.QQQ",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 6 },
    price: null,
    weight: { start: 8, length: 4, decimals: 3 },
  },
  ean13_t06: {
    name: "EAN13 Type 06 — Weight QQ.QQ",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 6 },
    price: null,
    weight: { start: 8, length: 4, decimals: 2 },
  },
  ean13_t07: {
    name: "EAN13 Type 07 — Weight QQ.QQQ ⭐",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 5 },
    price: null,
    weight: { start: 7, length: 5, decimals: 3 },
  },
  ean13_t08: {
    name: "EAN13 Type 08 — Weight QQQQ.Q",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 5 },
    price: null,
    weight: { start: 7, length: 5, decimals: 1 },
  },
  ean13_t09: {
    name: "EAN13 Type 09 — Weight QQQQQ",
    length: 13,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 5 },
    price: null,
    weight: { start: 7, length: 5, decimals: 0 },
  },

  // ===== EAN13: Fixed prefix 20-29 (Types 10-19) =====
  ean13_t10: {
    name: "EAN13 Type 10 — Fixed 20, Item Only",
    length: 13,
    department: { start: 0, length: 2, fixed: "20" },
    item: { start: 2, length: 10 },
    price: null,
    weight: null,
  },
  ean13_t11: {
    name: "EAN13 Type 11 — Fixed 21, Price (4)",
    length: 13,
    department: { start: 0, length: 2, fixed: "21" },
    item: { start: 2, length: 6 },
    price: { start: 8, length: 4, decimals: 2 },
    weight: null,
  },
  ean13_t12: {
    name: "EAN13 Type 12 — Fixed 22, Price (5) ⭐",
    length: 13,
    department: { start: 0, length: 2, fixed: "22" },
    item: { start: 2, length: 5 },
    price: { start: 7, length: 5, decimals: 2 },
    weight: null,
  },
  ean13_t13: {
    name: "EAN13 Type 13 — Fixed 23, Price (6)",
    length: 13,
    department: { start: 0, length: 2, fixed: "23" },
    item: { start: 2, length: 4 },
    price: { start: 6, length: 6, decimals: 2 },
    weight: null,
  },
  ean13_t14: {
    name: "EAN13 Type 14 — Fixed 24, Price (7)",
    length: 13,
    department: { start: 0, length: 2, fixed: "24" },
    item: { start: 2, length: 3 },
    price: { start: 5, length: 7, decimals: 2 },
    weight: null,
  },
  ean13_t15: {
    name: "EAN13 Type 15 — Fixed 25, Weight Q.QQQ",
    length: 13,
    department: { start: 0, length: 2, fixed: "25" },
    item: { start: 2, length: 6 },
    price: null,
    weight: { start: 8, length: 4, decimals: 3 },
  },
  ean13_t16: {
    name: "EAN13 Type 16 — Fixed 26, Weight QQ.QQ",
    length: 13,
    department: { start: 0, length: 2, fixed: "26" },
    item: { start: 2, length: 6 },
    price: null,
    weight: { start: 8, length: 4, decimals: 2 },
  },
  ean13_t17: {
    name: "EAN13 Type 17 — Fixed 27, Weight QQ.QQQ ⭐",
    length: 13,
    department: { start: 0, length: 2, fixed: "27" },
    item: { start: 2, length: 5 },
    price: null,
    weight: { start: 7, length: 5, decimals: 3 },
  },
  ean13_t18: {
    name: "EAN13 Type 18 — Fixed 28, Weight QQQQ.Q",
    length: 13,
    department: { start: 0, length: 2, fixed: "28" },
    item: { start: 2, length: 5 },
    price: null,
    weight: { start: 7, length: 5, decimals: 1 },
  },
  ean13_t19: {
    name: "EAN13 Type 19 — Fixed 29, Weight QQQQQ",
    length: 13,
    department: { start: 0, length: 2, fixed: "29" },
    item: { start: 2, length: 5 },
    price: null,
    weight: { start: 7, length: 5, decimals: 0 },
  },

  // ===== EAN13: 1-digit department (Types 21-29) =====
  ean13_t21: {
    name: "EAN13 Type 21 — 1D, Price (4)",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 7 },
    price: { start: 8, length: 4, decimals: 2 },
    weight: null,
  },
  ean13_t22: {
    name: "EAN13 Type 22 — 1D, Price (5) ⭐",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: { start: 7, length: 5, decimals: 2 },
    weight: null,
  },
  ean13_t23: {
    name: "EAN13 Type 23 — 1D, Price (6)",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 5 },
    price: { start: 6, length: 6, decimals: 2 },
    weight: null,
  },
  ean13_t24: {
    name: "EAN13 Type 24 — 1D, Price (7)",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 4 },
    price: { start: 5, length: 7, decimals: 2 },
    weight: null,
  },
  ean13_t25: {
    name: "EAN13 Type 25 — 1D, Weight Q.QQQ",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 7 },
    price: null,
    weight: { start: 8, length: 4, decimals: 3 },
  },
  ean13_t26: {
    name: "EAN13 Type 26 — 1D, Weight QQ.QQ",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 7 },
    price: null,
    weight: { start: 8, length: 4, decimals: 2 },
  },
  ean13_t27: {
    name: "EAN13 Type 27 — 1D, Weight QQ.QQQ ⭐",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: null,
    weight: { start: 7, length: 5, decimals: 3 },
  },
  ean13_t28: {
    name: "EAN13 Type 28 — 1D, Weight QQQQ.Q",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: null,
    weight: { start: 7, length: 5, decimals: 1 },
  },
  ean13_t29: {
    name: "EAN13 Type 29 — 1D, Weight QQQQQ",
    length: 13,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: null,
    weight: { start: 7, length: 5, decimals: 0 },
  },

  // ===== EAN18: Price + Weight (Types 30-35) =====
  ean18_t30: {
    name: "EAN18 Type 30 — Price + Weight QQ.QQQ ⭐",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: { start: 7, length: 5, decimals: 2 },
    weight: { start: 12, length: 5, decimals: 3 },
  },
  ean18_t31: {
    name: "EAN18 Type 31 — Price + Weight QQQQ.Q",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: { start: 7, length: 5, decimals: 2 },
    weight: { start: 12, length: 5, decimals: 1 },
  },
  ean18_t32: {
    name: "EAN18 Type 32 — Price + Weight QQQQQ",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: { start: 7, length: 5, decimals: 2 },
    weight: { start: 12, length: 5, decimals: 0 },
  },

  // ===== EAN18: Unit Price + Weight (Types 40-45) =====
  ean18_t40: {
    name: "EAN18 Type 40 — Unit Price + Weight WW.WWW ⭐",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    unitPrice: { start: 7, length: 5, decimals: 2 },
    weight: { start: 12, length: 5, decimals: 3 },
  },
  ean18_t41: {
    name: "EAN18 Type 41 — Unit Price + Weight WWWW.W",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    unitPrice: { start: 7, length: 5, decimals: 2 },
    weight: { start: 12, length: 5, decimals: 1 },
  },
  ean18_t42: {
    name: "EAN18 Type 42 — Unit Price + Weight WWWWW",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    unitPrice: { start: 7, length: 5, decimals: 2 },
    weight: { start: 12, length: 5, decimals: 0 },
  },

  // ===== EAN18: Weight + Price (Types 79-87) =====
  ean18_t79: {
    name: "EAN18 Type 79 — Weight WW.WWW + Price",
    length: 18,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 6 },
    weight: { start: 8, length: 5, decimals: 3 },
    price: { start: 13, length: 5, decimals: 2 },
  },
  ean18_t80: {
    name: "EAN18 Type 80 — Weight WW.WWW + Price ⭐",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    weight: { start: 7, length: 5, decimals: 3 },
    price: { start: 12, length: 5, decimals: 2 },
  },
  ean18_t81: {
    name: "EAN18 Type 81 — Weight WWWW.W + Price",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    weight: { start: 7, length: 5, decimals: 1 },
    price: { start: 12, length: 5, decimals: 2 },
  },
  ean18_t82: {
    name: "EAN18 Type 82 — Weight WWWWW + Price",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    weight: { start: 7, length: 5, decimals: 0 },
    price: { start: 12, length: 5, decimals: 2 },
  },
  ean18_t83: {
    name: "EAN18 Type 83 — Weight WW.WWW + Unit Price",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    weight: { start: 7, length: 5, decimals: 3 },
    unitPrice: { start: 12, length: 5, decimals: 2 },
  },
  ean18_t84: {
    name: "EAN18 Type 84 — Weight WWWW.W + Unit Price",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    weight: { start: 7, length: 5, decimals: 1 },
    unitPrice: { start: 12, length: 5, decimals: 2 },
  },
  ean18_t85: {
    name: "EAN18 Type 85 — Weight WWWWW + Unit Price",
    length: 18,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    weight: { start: 7, length: 5, decimals: 0 },
    unitPrice: { start: 12, length: 5, decimals: 2 },
  },
  ean18_t87: {
    name: "EAN18 Type 87 — Weight WW.WWW + Price (2D)",
    length: 18,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 5 },
    weight: { start: 7, length: 5, decimals: 3 },
    price: { start: 12, length: 5, decimals: 2 },
  },

  // ===== EAN8: Simple lookup (Types 50-55) =====
  ean8_t50: {
    name: "EAN8 Type 50 — Item Only (7)",
    length: 8,
    department: null,
    item: { start: 0, length: 7 },
    price: null,
    weight: null,
  },
  ean8_t51: {
    name: "EAN8 Type 51 — 1D + Item (6)",
    length: 8,
    department: { start: 0, length: 1 },
    item: { start: 1, length: 6 },
    price: null,
    weight: null,
  },
  ean8_t52: {
    name: "EAN8 Type 52 — 2D + Item (5)",
    length: 8,
    department: { start: 0, length: 2 },
    item: { start: 2, length: 5 },
    price: null,
    weight: null,
  },
};

// ===== PARSE A BARCODE USING A FORMAT =====
export function parseScaleBarcode(barcode, formatConfig) {
  if (!barcode || !formatConfig) return null;

  const code = String(barcode).trim();

  // Validate length
  if (code.length !== formatConfig.length) return null;

  // Validate all digits
  if (!/^\d+$/.test(code)) return null;

  const result = {
    department: null,
    itemId: null,
    price: null,       // Total price (from barcode)
    unitPrice: null,   // Unit price per KG (from barcode)
    weight: null,      // Weight in KG
    raw: code,
    format: formatConfig,
  };

  // Extract department
  if (formatConfig.department) {
    const d = formatConfig.department;
    result.department = code.substring(d.start, d.start + d.length);
    
    // Check fixed prefix
    if (d.fixed && result.department !== d.fixed) {
      return null; // Doesn't match fixed prefix
    }
  }

  // Extract item number
  if (formatConfig.item) {
    const i = formatConfig.item;
    result.itemId = parseInt(code.substring(i.start, i.start + i.length), 10);
  }

  // Extract total price
  if (formatConfig.price) {
    const p = formatConfig.price;
    const rawPrice = code.substring(p.start, p.start + p.length);
    result.price = parseWithDecimals(rawPrice, p.decimals);
  }

  // Extract unit price
  if (formatConfig.unitPrice) {
    const u = formatConfig.unitPrice;
    const rawUnit = code.substring(u.start, u.start + u.length);
    result.unitPrice = parseWithDecimals(rawUnit, u.decimals);
  }

  // Extract weight
  if (formatConfig.weight) {
    const w = formatConfig.weight;
    const rawWeight = code.substring(w.start, w.start + w.length);
    result.weight = parseWithDecimals(rawWeight, w.decimals);
  }

  return result;
}

// ===== HELPER: Parse number with decimal positions =====
function parseWithDecimals(rawStr, decimals) {
  if (!rawStr || rawStr.length === 0) return 0;
  const num = parseInt(rawStr, 10);
  if (decimals === 0) return num;
  return num / Math.pow(10, decimals);
}

// ===== TRY ALL PREDEFINED FORMATS (auto-detect) =====
export function autoDetectFormat(barcode) {
  const code = String(barcode).trim();
  
  for (const [key, format] of Object.entries(PREDEFINED_FORMATS)) {
    if (code.length === format.length) {
      const result = parseScaleBarcode(code, format);
      if (result && result.itemId !== null && result.itemId > 0) {
        return { formatKey: key, format, result };
      }
    }
  }
  return null;
}

// ===== GET FORMAT LIST FOR DROPDOWN =====
export function getFormatList() {
  return Object.entries(PREDEFINED_FORMATS).map(([key, format]) => ({
    key,
    name: format.name,
    length: format.length,
    hasPrice: Boolean(format.price),
    hasUnitPrice: Boolean(format.unitPrice),
    hasWeight: Boolean(format.weight),
  }));
}