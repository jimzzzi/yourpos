import { api } from "../api/client";

function centerText(text, width) {
  const t = String(text || "");
  if (t.length >= width) return t.slice(0, width);
  const left = Math.floor((width - t.length) / 2);
  return " ".repeat(left) + t + " ".repeat(width - t.length - left);
}

function leftRight(left, right, width) {
  const l = String(left || "");
  const r = String(right || "");
  const space = width - l.length - r.length;
  if (space <= 0) return (l + " " + r).slice(0, width);
  return l + " ".repeat(space) + r;
}

function formatLine(label, value, width, isArabic) {
  if (isArabic) {
    const l = String(value || "");
    const r = String(label || "");
    const space = width - l.length - r.length;
    if (space <= 0) return (l + " " + r).slice(0, width);
    return l + " ".repeat(space) + r;
  } else {
    const l = String(label || "");
    const r = String(value || "");
    const space = width - l.length - r.length;
    if (space <= 0) return (l + " " + r).slice(0, width);
    return l + " ".repeat(space) + r;
  }
}

function divider(width, char = "-") {
  return char.repeat(width);
}

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeLines(value, fallback) {
  const base = Array.isArray(value) ? value : fallback ? [fallback] : [];
  return base
    .map((x) => (typeof x === "string" ? x : (x.text || "")))
    .filter((l) => String(l).trim() !== "");
}

function getReceiptSettings(settings, store) {
  const r = (settings && settings.receipt) || {};
  let headerLines = normalizeLines(r.headerLines, r.headerText);
  if (headerLines.length === 0) headerLines = [(store && store.name) || "YOUR STORE"];
  const footerLines = normalizeLines(r.footerLines, r.footerText);
  return { ...r, headerLines, footerLines };
}

function getDecimals(settings) {
  const d = settings && settings.decimals;
  const n = Number(d);
  return Number.isInteger(n) && n >= 0 && n <= 4 ? n : 2;
}

function fmt(value, settings) {
  return Number(value || 0).toFixed(getDecimals(settings));
}

const AR_LABELS = {
  subtotal: "المجموع الفرعي",
  subtotalExcl: "المجموع (بدون ضريبة)",
  vat: "ضريبة القيمة المضافة",
  total: "الإجمالي",
  totalIncl: "الإجمالي (شامل الضريبة)",
  discount: "الخصم",
  cash: "نقداً",
  card: "بطاقة",
  tendered: "المبلغ المدفوع",
  change: "الباقي",
  dineIn: "تناول في المطعم",
  takeaway: "سفري",
  billNo: "رقم الفاتورة",
  date: "التاريخ",
  table: "الطاولة",
  copy: "★ نسخة من الفاتورة ★",
};

function getLbl(key, settings, defaultEn) {
  const lang = settings && settings.receiptLanguage;
  if (lang === "ar" && AR_LABELS[key]) {
    return AR_LABELS[key];
  }
  return defaultEn;
}

function buildReceiptParts(args) {
  const a = args || {};
  const store = a.store;
  const rs = getReceiptSettings(a.settings, store);
  const headerLines = rs.headerLines;
  const footerLines = rs.footerLines;
  const width = rs.paperSize === "58" ? 26 : 36;
  const vatInclusive = Boolean(store && store.tax_inclusive);
  const rate = Number(store && store.tax_rate ? store.tax_rate : 0);
  const isArabic = a.settings && a.settings.receiptLanguage === "ar";

  const originalDate = a.createdAt ? new Date(a.createdAt).toLocaleString() : new Date().toLocaleString();
  const dateLine = originalDate;
  const printedLine = a.duplicate ? "Printed: " + new Date().toLocaleString() : null;
  const billLine = a.billNumber ? getLbl("billNo", a.settings, "Bill No") + ": " + String(a.billNumber).padStart(6, "0") : null;
  const diningLine = a.dining ? (a.dining === "takeaway" ? getLbl("takeaway", a.settings, "TAKEAWAY") : getLbl("dineIn", a.settings, "DINE IN")) : null;
  const tableLine = a.table ? getLbl("table", a.settings, "TABLE") + ": " + a.table : null;

  const itemsLines = [];
  (a.items || []).forEach((item) => {
    let itemDisplay = String(item.name || "Item");
    if (item.time_elapsed_minutes) {
      itemDisplay += " (" + item.time_elapsed_minutes + "min)";
    }
    itemsLines.push(itemDisplay.slice(0, width));
    if (item.description) itemsLines.push("  " + String(item.description).slice(0, Math.max(8, width - 2)));
    if (item.time_elapsed_minutes) {
      itemsLines.push("  " + item.time_units + " x " + item.time_unit_minutes + "min @ " + fmt(item.original_price || item.price, a.settings));
    }
    (item.modifiers || []).forEach((m) => {
      itemsLines.push(" + " + String(m.name || "").slice(0, Math.max(8, width - 4)));
    });
    itemsLines.push(
      formatLine(
        (item.quantity || 0) + " x " + fmt(item.price, a.settings),
        fmt((item.price || 0) * (item.quantity || 0), a.settings),
        width,
        isArabic
      )
    );
  });
  itemsLines.push(divider(width));

  const totals = [];
  if (a.discount && Number(a.discount) > 0) {
    totals.push(formatLine(getLbl("discount", a.settings, "Discount"), "-" + fmt(a.discount, a.settings), width, isArabic));
  }
  totals.push(formatLine(
    vatInclusive 
      ? getLbl("subtotalExcl", a.settings, "Subtotal (excl. VAT)") 
      : getLbl("subtotal", a.settings, "Subtotal"),
    fmt(a.subtotal, a.settings),
    width,
    isArabic
  ));
  if (rs.showTax !== false) {
    totals.push(formatLine(
      getLbl("vat", a.settings, "VAT") + " " + rate + "%",
      fmt(a.tax, a.settings),
      width,
      isArabic
    ));
  }
  const totalLabel = vatInclusive
    ? getLbl("totalIncl", a.settings, "TOTAL (incl. VAT)")
    : getLbl("total", a.settings, "TOTAL");
  const totalValue = fmt(a.total, a.settings);

  const pays = [];
  pays.push(divider(width));
  const payment = a.payment;
  if (payment) {
    (payment.payments || []).forEach((p) => {
      const method = String(p.method || "").toLowerCase();
      const methodLabel = method === "cash" 
        ? getLbl("cash", a.settings, "CASH") 
        : method === "card" 
        ? getLbl("card", a.settings, "CARD") 
        : method.toUpperCase();
      pays.push(formatLine(methodLabel, fmt(p.amount, a.settings), width, isArabic));
    });
    if (payment.payment_method === "cash") {
      pays.push(formatLine(getLbl("tendered", a.settings, "Tendered"), fmt(payment.amount_tendered, a.settings), width, isArabic));
      pays.push(formatLine(getLbl("change", a.settings, "Change"), fmt(payment.change_due, a.settings), width, isArabic));
    }
  }

  return { rs, width, headerLines, footerLines, dateLine, printedLine, billLine, diningLine, tableLine, itemsLines, totals, totalLabel, totalValue, pays };
}

export function buildReceiptText(args) {
  const p = buildReceiptParts(args);
  const lines = [];
  const isArabic = args && args.settings && args.settings.receiptLanguage === "ar";

  if (args && args.duplicate) {
    lines.push(centerText(getLbl("copy", args.settings, "★ COPY / DUPLICATE BILL ★"), p.width));
    lines.push("");
  }

  p.headerLines.forEach((l) => lines.push(centerText(l, p.width)));
  lines.push(centerText(p.dateLine, p.width));
  if (p.printedLine) lines.push(centerText(p.printedLine, p.width));
  if (p.billLine) lines.push(centerText(p.billLine, p.width));
  if (p.diningLine) lines.push(centerText(p.diningLine, p.width));
  if (p.tableLine) lines.push(centerText(p.tableLine, p.width));
  lines.push(divider(p.width));
  p.itemsLines.forEach((l) => lines.push(l));
  p.totals.forEach((l) => lines.push(l));
  lines.push(formatLine(p.totalLabel, p.totalValue, p.width, isArabic));
  p.pays.forEach((l) => lines.push(l));
  if (p.footerLines.length > 0) {
    lines.push(divider(p.width));
    p.footerLines.forEach((l) => lines.push(centerText(l, p.width)));
  }
  return lines.join("\n");
}

export function buildReceiptHtml(args) {
  const p = buildReceiptParts(args);
  const is58 = p.rs.paperSize === "58";
  const paper = is58 ? "58mm" : "80mm";
  const padding = is58 ? "2mm 3mm" : "2mm 4mm";
  const logoHeader = p.rs.headerLogo ? '<img src="' + p.rs.headerLogo + '" class="logo" />' : "";
  const logoFooter = p.rs.footerLogo ? '<img src="' + p.rs.footerLogo + '" class="logo" />' : "";

  const lang = args && args.settings && args.settings.receiptLanguage;
  const isArabic = lang === "ar";
  const dirAttr = isArabic ? ' dir="rtl"' : '';
  const fontFamily = isArabic ? "'Arial', 'Tahoma', sans-serif" : "'Courier New', monospace";

  let headerHtml = "";
  if (args && args.duplicate) {
    headerHtml += '<div class="bigcenter" style="font-size: 18px; letter-spacing: 1px; margin-bottom: 6px; border-bottom: 2px dashed #000; padding-bottom: 4px;">' + escapeHtml(getLbl("copy", args.settings, "★ COPY / DUPLICATE BILL ★")) + "</div>";
  }

  p.headerLines.forEach((l) => { headerHtml += '<div class="c">' + escapeHtml(l) + "</div>"; });
  headerHtml += '<div class="c">' + escapeHtml(p.dateLine) + "</div>";
  if (p.printedLine) headerHtml += '<div class="c" style="font-size: 11px;">' + escapeHtml(p.printedLine) + "</div>";
  if (p.billLine) headerHtml += '<div class="bigcenter">' + escapeHtml(p.billLine) + "</div>";
  if (p.diningLine) headerHtml += '<div class="bigcenter">' + escapeHtml(p.diningLine) + "</div>";
  if (p.tableLine) headerHtml += '<div class="c">' + escapeHtml(p.tableLine) + "</div>";
  headerHtml += '<div class="c">' + escapeHtml(divider(p.width)) + "</div>";

  let footerHtml = "";
  if (p.footerLines.length > 0) {
    footerHtml += '<div class="c">' + escapeHtml(divider(p.width)) + "</div>";
    p.footerLines.forEach((l) => { footerHtml += '<div class="c">' + escapeHtml(l) + "</div>"; });
  }

  return (
    "<html><head><title>Receipt</title><style>" +
    "@page { size: " + paper + " auto; margin: 0; }" +
    "html, body { margin: 0; padding: 0; }" +
    "body { box-sizing: border-box; width: " + paper + "; padding: " + padding + "; font-family: " + fontFamily + "; font-size: 12px; font-weight: bold; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
    "pre { margin: 0; font-family: inherit; font-size: inherit; font-weight: inherit; white-space: pre-wrap; }" +
    ".c { text-align: center; font-size: 12px; }" +
    ".bigcenter { text-align: center; font-size: 16px; font-weight: bold; margin: 3px 0; }" +
    ".logo { max-width: 90%; max-height: 24mm; display: block; margin: 0 auto 4px; }" +
    ".bigrow { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin: 4px 0; }" +
    "</style></head><body" + dirAttr + ">" +
    logoHeader + headerHtml +
    "<pre>" + escapeHtml(p.itemsLines.join("\n")) + "</pre>" +
    "<pre>" + escapeHtml(p.totals.join("\n")) + "</pre>" +
    "<div class='bigrow'><span>" + escapeHtml(p.totalLabel) + "</span><span>" + escapeHtml(p.totalValue) + "</span></div>" +
    "<pre>" + escapeHtml(p.pays.join("\n")) + "</pre>" +
    footerHtml + logoFooter +
    "</body></html>"
  );
}

export function buildKitchenTicketHtml(args) {
  const a = args || {};
  const type = String(a.type || "NEW").toUpperCase();
  const items = a.items || [];
  const table = a.table || "-";
  const billNumber = a.billNumber ? String(a.billNumber).padStart(6, "0") : null;
  const voidedItem = a.voidedItem;
  const voidedBy = a.voidedBy || "";
  const voidReason = a.voidReason || "";
  const is58 = a.paperSize === "58";
  const paper = is58 ? "58mm" : "80mm";
  const padding = is58 ? "2mm 3mm" : "2mm 4mm";
  const now = new Date().toLocaleString();

  let headerText = "*** NEW ORDER ***";
  if (type === "ADDITION") headerText = "*** ADDITION ***";
  if (type === "VOID") headerText = "###  VOID  ###";

  let html = "<html><head><title>Kitchen</title><style>";
  html += "@page { size: " + paper + " auto; margin: 0; }";
  html += "html, body { margin: 0; padding: 0; }";
  html += "body { box-sizing: border-box; width: " + paper + "; padding: " + padding + "; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }";
  html += ".header { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 2px; margin: 4px 0 8px; }";
  html += ".table-box { text-align: center; font-size: 30px; font-weight: 900; padding: 6px; border: 3px solid #000; margin-bottom: 6px; }";
  html += ".meta { text-align: center; font-size: 13px; margin-bottom: 6px; }";
  html += ".item { margin: 6px 0; padding: 4px 0; border-bottom: 2px solid #000; }";
  html += ".item-name { font-size: 16px; font-weight: 900; }";
  html += ".item-qty { font-size: 18px; font-weight: 900; margin-right: 6px; }";
  html += ".modifier { font-size: 13px; font-weight: 900; padding-left: 18px; margin-top: 2px; }";
  html += ".void-line { text-align: center; font-size: 13px; font-weight: 900; margin: 4px 0; }";
  html += ".footer { margin-top: 10px; text-align: center; font-size: 12px; border-top: 2px solid #000; padding-top: 6px; }";
  html += "</style></head><body>";

  html += '<div class="header">' + escapeHtml(headerText) + "</div>";

  if (type === "VOID" && voidedItem) {
    html += '<div class="table-box">' + escapeHtml(table) + "</div>";
    if (billNumber) html += '<div class="meta">Bill #' + escapeHtml(billNumber) + "</div>";
    html += '<div class="item"><span class="item-qty">1x</span><span class="item-name">' + escapeHtml(voidedItem.name) + "</span></div>";
    if (voidedItem.modifiers && voidedItem.modifiers.length) {
      voidedItem.modifiers.forEach((m) => { html += '<div class="modifier">+ ' + escapeHtml(m.name) + "</div>"; });
    }
    if (voidReason) html += '<div class="void-line">Reason: ' + escapeHtml(voidReason) + "</div>";
    if (voidedBy) html += '<div class="void-line">By: ' + escapeHtml(voidedBy) + "</div>";
  } else {
    html += '<div class="table-box">' + escapeHtml(table) + "</div>";
    if (billNumber) html += '<div class="meta">Bill #' + escapeHtml(billNumber) + "</div>";
    if (a.dining) html += '<div class="meta">' + escapeHtml(a.dining === "takeaway" ? "TAKEAWAY" : "DINE-IN") + "</div>";

    items.forEach((item) => {
      html += '<div class="item"><span class="item-qty">' + (item.quantity || 1) + "x</span><span class=\"item-name\">" + escapeHtml(item.name) + "</span></div>";
      if (item.description) html += '<div class="modifier">' + escapeHtml(item.description) + "</div>";
      (item.modifiers || []).forEach((m) => {
        html += '<div class="modifier">* ' + escapeHtml(m.name) + "</div>";
      });
      if (item.notes) html += '<div class="modifier">NOTE: ' + escapeHtml(item.notes) + "</div>";
    });
  }

  html += '<div class="footer">' + escapeHtml(now) + "</div>";
  html += "</body></html>";
  return html;
}

export function buildKitchenTicketText(args) {
  const a = args || {};
  const type = String(a.type || "NEW").toUpperCase();
  const items = a.items || [];
  const table = a.table || "-";
  const billNumber = a.billNumber ? String(a.billNumber).padStart(6, "0") : null;
  const width = 32;

  let lines = [];

  if (type === "VOID") {
    lines.push(centerText("### VOID ###", width));
    lines.push(centerText(table, width));
    if (billNumber) lines.push(centerText("Bill #" + billNumber, width));
    lines.push(divider(width, "="));
    if (a.voidedItem) {
      lines.push("1x " + a.voidedItem.name);
      if (a.voidedItem.modifiers) {
        a.voidedItem.modifiers.forEach(m => lines.push("  + " + m.name));
      }
    }
    if (a.voidReason) lines.push("Reason: " + a.voidReason);
    if (a.voidedBy) lines.push("By: " + a.voidedBy);
  } else {
    let header = "*** NEW ORDER ***";
    if (type === "ADDITION") header = "*** ADDITION ***";
    lines.push(centerText(header, width));
    lines.push("");
    lines.push(centerText(table, width));
    if (billNumber) lines.push(centerText("Bill #" + billNumber, width));
    if (a.dining) lines.push(centerText(a.dining === "takeaway" ? "TAKEAWAY" : "DINE-IN", width));
    lines.push(divider(width, "="));

    items.forEach(item => {
      lines.push((item.quantity || 1) + "x " + item.name);
      if (item.description) lines.push("   " + item.description);
      if (item.modifiers) {
        item.modifiers.forEach(m => lines.push("   * " + m.name));
      }
      if (item.notes) lines.push("   NOTE: " + item.notes);
    });
  }

  lines.push(divider(width, "="));
  lines.push(centerText(new Date().toLocaleTimeString(), width));

  return lines.join("\n");
}

export function getKitchenPrinters(settings) {
  const s = settings || {};
  if (Array.isArray(s.kitchenPrinters) && s.kitchenPrinters.length) return s.kitchenPrinters;
  if (s.kitchenPrinter) return [{ id: "kp1", name: "Kitchen 1", ...s.kitchenPrinter }];
  return [];
}

export function routeItemsForKitchen(items, settings) {
  const kps = getKitchenPrinters(settings).filter((k) => k.enabled !== false);
  if (!kps.length) return [];
  const routing = settings.kpRouting || {};
  const groups = {};
  (items || []).forEach((item) => {
    let pid = routing.categories ? routing.categories[String(item.category_id)] : null;
    if (!pid) pid = routing.default || null;
    let printer = kps.find((k) => k.id === pid);
    if (!printer) printer = kps[0];
    if (!groups[printer.id]) groups[printer.id] = { printer, items: [] };
    groups[printer.id].items.push(item);
  });
  return Object.values(groups);
}

function printViaBrowser(html) {
  if (typeof document === "undefined") {
    return { success: false, error: "Printing not supported on this device." };
  }
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error("[PRINT] print failed:", e);
    }
  }, 400);

  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch (e) {}
  }, 60000);
  return { success: true };
}

async function sendToNetworkPrinter(address, port, textBody) {
  await fetch("http://" + address + ":" + (port || 9100) + "/print", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: textBody,
  });
}

async function sendToCloudAgent(printerName, textContent) {
  try {
    await api.post("/print/jobs", {
      printer_name: printerName || "default",
      content: textContent,
    });
    return { success: true, method: "cloud" };
  } catch (error) {
    console.error("[CLOUD PRINT] Failed:", error);
    return { success: false, error: error.message };
  }
}

const USE_CLOUD_PRINT = false;

export async function printReceipt(args) {
  try {
    const settings = (args && args.settings) || {};
    const printer = settings.printer || { enabled: false };
    const isTest = args && args.orderId === "TEST000123";

    if (!printer.enabled && !isTest) {
      return { success: false, error: "Printer is disabled. Enable it in Settings → Printer." };
    }

    const html = buildReceiptHtml(args);
    return printViaBrowser(html);
  } catch (error) {
    console.error("[PRINT] error:", error);
    return { success: false, error: (error && error.message) || "Print failed." };
  }
}

export async function printKitchenTicket(args) {
  try {
    const settings = (args && args.settings) || {};
    let kp = args.printer || null;
    if (!kp) {
      const list = getKitchenPrinters(settings);
      kp = list[0] || null;
    }
    if (!kp || kp.enabled === false) {
      return { success: false, error: "Kitchen printer disabled." };
    }

    const html = buildKitchenTicketHtml({ ...args, paperSize: kp.paperSize || "80" });
    return printViaBrowser(html);
  } catch (error) {
    console.error("[KP] error:", error);
    return { success: false, error: error.message };
  }
}

function buildDrawerKickCommand(pin) {
  const m = pin === 5 ? 1 : 0;
  return "\x1B\x70" + String.fromCharCode(m) + "\x19\xFA";
}

function buildDrawerHtml(pin) {
  const cmd = buildDrawerKickCommand(pin);
  return (
    "<html><head><style>" +
    "@page { size: 80mm 1mm; margin: 0; }" +
    "html, body { margin: 0; padding: 0; background: #fff; width: 80mm; height: 1mm; overflow: hidden; }" +
    "body { font-family: 'Courier New', monospace; }" +
    "pre { color: #fff; background: #fff; font-size: 1px; line-height: 1px; height: 0; overflow: hidden; margin: 0; padding: 0; }" +
    "</style></head><body>" +
    "<pre>" + cmd + "</pre>" +
    "</body></html>"
  );
}

function silentDrawerPrint(html) {
  if (typeof document === "undefined") {
    return { success: false, error: "Printing not supported." };
  }
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error("[DRAWER] silent print failed:", e);
    }
  }, 200);

  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch (e) {}
  }, 3000);

  return { success: true };
}

export async function openCashDrawer(settings) {
  try {
    const s = settings || {};
    const cd = s.cashDrawer || {};

    if (cd.enabled === false) {
      return { success: false, error: "Cash drawer is disabled." };
    }

    const pin = cd.pin || 2;
    const html = buildDrawerHtml(pin);
    return silentDrawerPrint(html);
  } catch (error) {
    console.error("[DRAWER] error:", error);
    return { success: false, error: error.message };
  }
}

function qrStyleHtml() {
  return (
    "@page { size: 80mm auto; margin: 0; }" +
    "html, body { margin: 0; padding: 0; }" +
    "body { box-sizing: border-box; width: 80mm; font-family: Arial, sans-serif; color: #000; }" +
    ".page { padding: 4mm; text-align: center; }" +
    ".store { font-size: 15px; font-weight: bold; margin-bottom: 2mm; }" +
    ".scan { font-size: 11px; font-weight: bold; margin-bottom: 3mm; letter-spacing: 1px; }" +
    ".qr { width: 58mm; height: 58mm; }" +
    ".table { font-size: 18px; font-weight: 900; margin-top: 3mm; border: 2px solid #000; display: inline-block; padding: 1.5mm 6mm; }" +
    ".foot { font-size: 9px; margin-top: 3mm; color: #444; }"
  );
}

function qrPageHtml(storeName, tableName, qrUrl) {
  const qrImage = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(qrUrl);
  return (
    '<div class="store">' + escapeHtml(storeName) + "</div>" +
    '<div class="scan">SCAN TO VIEW MENU &amp; ORDER</div>' +
    '<img class="qr" src="' + qrImage + '" />' +
    '<div class="table">' + escapeHtml(tableName) + "</div>" +
    '<div class="foot">Scan • Order • We bring it to your table</div>'
  );
}

function printViaBrowserWaitImages(html) {
  if (typeof document === "undefined") {
    return { success: false, error: "Printing not supported on this device." };
  }
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {}
  };

  const imgs = doc.images ? Array.from(doc.images) : [];
  if (imgs.length === 0) {
    setTimeout(doPrint, 400);
  } else {
    let loaded = 0;
    const tick = () => { loaded++; if (loaded >= imgs.length) setTimeout(doPrint, 200); };
    imgs.forEach((img) => {
      if (img.complete) tick();
      else { img.onload = tick; img.onerror = tick; }
    });
    setTimeout(doPrint, 3000);
  }

  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch (e) {}
  }, 60000);
  return { success: true };
}

export function printQRSheet(args) {
  const a = args || {};
  const html = "<html><head><style>" + qrStyleHtml() + ".page { page-break-after: auto; }</style></head><body><div class='page'>" + qrPageHtml(a.storeName, a.tableName, a.qrUrl) + "</div></body></html>";
  return printViaBrowserWaitImages(html);
}

export function printQRSheets(args) {
  const a = args || {};
  const pages = (a.tables || []).map((tb) => "<div class='page'>" + qrPageHtml(a.storeName, tb.name, a.qrBase + "/?qr=" + tb.id) + "</div>").join("");
  const html = "<html><head><style>" + qrStyleHtml() + ".page { page-break-after: always; }</style></head><body>" + pages + "</body></html>";
  return printViaBrowserWaitImages(html);
}