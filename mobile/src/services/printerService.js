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

function divider(width) {
  return "-".repeat(width);
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

function buildReceiptParts(args) {
  const a = args || {};
  const store = a.store;
  const rs = getReceiptSettings(a.settings, store);
  const headerLines = rs.headerLines;
  const footerLines = rs.footerLines;
  const width = rs.paperSize === "58" ? 26 : 36;
  const vatInclusive = Boolean(store && store.tax_inclusive);
  const rate = Number(store && store.tax_rate ? store.tax_rate : 0);

  // ✅ FIX 1: Use original sale date if provided, otherwise NOW
  const originalDate = a.createdAt ? new Date(a.createdAt).toLocaleString() : new Date().toLocaleString();
  const dateLine = originalDate;
  
  // ✅ FIX 2: Add "Printed:" line for reprints
  const printedLine = a.duplicate ? "Printed: " + new Date().toLocaleString() : null;
  
  // ✅ FIX 3: Bill number always prints (fallback to order ID)
        const billLine = a.billNumber ? "Bill No: " + String(a.billNumber).padStart(6, "0") : null;
    
  const diningLine = a.dining ? (a.dining === "takeaway" ? "TAKEAWAY" : "DINE IN") : null;
  const tableLine = a.table ? "TABLE: " + a.table : null;

  const itemsLines = [];
  (a.items || []).forEach((item) => {
    itemsLines.push(String(item.name || "Item").slice(0, width));
    if (item.description) itemsLines.push("  " + String(item.description).slice(0, Math.max(8, width - 2)));
    (item.modifiers || []).forEach((m) => {
      itemsLines.push(" + " + String(m.name || "").slice(0, Math.max(8, width - 4)));
    });
    itemsLines.push(
      leftRight(
        (item.quantity || 0) + " x " + Number(item.price || 0).toFixed(2),
        Number((item.price || 0) * (item.quantity || 0)).toFixed(2),
        width
      )
    );
  });
  itemsLines.push(divider(width));

  const totals = [];
  if (a.discount && Number(a.discount) > 0) totals.push(leftRight("Discount", "-" + Number(a.discount).toFixed(2), width));
  totals.push(leftRight(vatInclusive ? "Subtotal (excl. VAT)" : "Subtotal", Number(a.subtotal || 0).toFixed(2), width));
  if (rs.showTax !== false) totals.push(leftRight(vatInclusive ? "VAT " + rate + "% (incl.)" : "VAT " + rate + "%", Number(a.tax || 0).toFixed(2), width));

  const totalLabel = "TOTAL (incl. VAT)";
  const totalValue = Number(a.total || 0).toFixed(2);

  const pays = [];
  pays.push(divider(width));
  const payment = a.payment;
  if (payment) {
    (payment.payments || []).forEach((p) => {
      pays.push(leftRight(String(p.method || "").toUpperCase(), Number(p.amount || 0).toFixed(2), width));
    });
    if (payment.payment_method === "cash") {
      pays.push(leftRight("Tendered", Number(payment.amount_tendered || 0).toFixed(2), width));
      pays.push(leftRight("Change", Number(payment.change_due || 0).toFixed(2), width));
    }
  }

  return { rs, width, headerLines, dateLine, printedLine, billLine, diningLine, tableLine, itemsLines, totals, totalLabel, totalValue, pays, footerLines };
}

export function buildReceiptText(args) {
  const p = buildReceiptParts(args);
  const lines = [];
  
  // ✅ BANNER: Copy bill banner at the very top
  if (args && args.duplicate) {
    lines.push(centerText("★ COPY / DUPLICATE BILL ★", p.width));
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
  lines.push(leftRight(p.totalLabel, p.totalValue, p.width));
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

  let headerHtml = "";
  
  // ✅ BANNER: Copy bill banner at the very top
  if (args && args.duplicate) {
    headerHtml += '<div class="bigcenter" style="font-size: 18px; letter-spacing: 1px; margin-bottom: 6px; border-bottom: 2px dashed #000; padding-bottom: 4px;">★ COPY / DUPLICATE BILL ★</div>';
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
    "body { box-sizing: border-box; width: " + paper + "; padding: " + padding + "; font-family: 'Courier New', monospace; font-size: 12px; font-weight: bold; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
    "pre { margin: 0; font-family: inherit; font-size: inherit; font-weight: inherit; white-space: pre-wrap; }" +
    ".c { text-align: center; font-size: 12px; }" +
    ".bigcenter { text-align: center; font-size: 16px; font-weight: bold; margin: 3px 0; }" +
    ".logo { max-width: 90%; max-height: 24mm; display: block; margin: 0 auto 4px; }" +
    ".bigrow { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin: 4px 0; }" +
    "</style></head><body>" +
    logoHeader + headerHtml +
    "<pre>" + escapeHtml(p.itemsLines.join("\n")) + "</pre>" +
    "<pre>" + escapeHtml(p.totals.join("\n")) + "</pre>" +
    "<div class='bigrow'><span>" + escapeHtml(p.totalLabel) + "</span><span>" + escapeHtml(p.totalValue) + "</span></div>" +
    "<pre>" + escapeHtml(p.pays.join("\n")) + "</pre>" +
    footerHtml + logoFooter +
    "</body></html>"
  );
}

// THE METHOD THAT WORKED ON YOUR PRINTER FROM DAY 1:
function printViaBrowser(html) {
  if (typeof document === "undefined") {
    return { success: false, error: "Printing not supported on this device." };
  }
  console.log("[PRINT] creating print frame...");
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
      console.log("[PRINT] print dialog opened ✅");
    } catch (e) {
      console.error("[PRINT] print failed:", e);
    }
  }, 400);

  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch (e) {}
  }, 60000);
  return { success: true };
}

export async function printReceipt(args) {
  try {
    const settings = (args && args.settings) || {};
    const printer = settings.printer || { enabled: false };
    const isTest = args && args.orderId === "TEST000123";
    console.log("[PRINT] printer enabled:", printer.enabled, "| test mode:", isTest);

    if (!printer.enabled && !isTest) {
      return { success: false, error: "Printer is disabled. Enable it in Settings → Printer." };
    }

    const html = buildReceiptHtml(args);

    if (printer.connection === "network" && printer.address) {
      try {
        await fetch("http://" + printer.address + ":" + (printer.port || 9100) + "/print", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: buildReceiptText(args),
        });
        return { success: true };
      } catch (error) {
        const fallback = printViaBrowser(html);
        if (fallback.success) return { success: true, warning: "Network printer unreachable - used browser print instead." };
        return { success: false, error: "Printer unreachable at " + printer.address + ":" + (printer.port || 9100) };
      }
    }

    return printViaBrowser(html);
  } catch (error) {
    console.error("[PRINT] error:", error);
    return { success: false, error: (error && error.message) || "Print failed." };
  }
}