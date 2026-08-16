import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Platform, Alert } from "react-native";
import { backofficeApi } from "../api/backoffice";
import { reportsApi } from "../api/reports";
import { useAuth } from "../auth/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { telegramApi } from "../api/telegram";

function pctChange(cur, prev) {
  const c = Number(cur || 0), p = Number(prev || 0);
  if (p === 0) return null;
  return ((c - p) / p) * 100;
}

function LineChart({ data, height }) {
  const h = height || 190;
  if (Platform.OS !== "web") return null;
  let series = data || [];
  if (series.length === 1) series = [series[0], series[0]];
  if (series.length === 0) return null;
  const W = 800, H = 170, PAD = 14;
  const max = Math.max.apply(null, series.map((d) => d.gross).concat([1]));
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const pts = series.map((d, i) => [PAD + i * step, H - 26 - (Number(d.gross || 0) / max) * (H - 50)]);
  const line = pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = PAD + "," + (H - 26) + " " + line + " " + (W - PAD) + "," + (H - 26);
  const every = Math.max(1, Math.ceil(series.length / 12));
  const labels = series
    .map((d, i) =>
      i % every === 0
        ? "<text x='" + pts[i][0].toFixed(1) + "' y='" + (H - 8) + "' font-size='10' fill='#94A3B8' text-anchor='middle'>" + d.label + "</text>"
        : ""
    )
    .join("");
  const dots = pts
    .map((p) => "<circle cx='" + p[0].toFixed(1) + "' cy='" + p[1].toFixed(1) + "' r='3.5' fill='#fff' stroke='#43A047' stroke-width='2'/>")
    .join("");
  const svg =
    "<svg viewBox='0 0 " + W + " " + H + "' preserveAspectRatio='none' style='width:100%;height:100%;display:block'>" +
    "<polygon points='" + area + "' fill='rgba(67,160,71,0.15)'/>" +
    "<polyline points='" + line + "' fill='none' stroke='#43A047' stroke-width='2.5'/>" +
    dots + labels + "</svg>";
  const html = "<html><body style='margin:0;padding:0;overflow:hidden;height:100%'>" + svg + "</body></html>";
  return <iframe srcDoc={html} scrolling="no" style={{ width: "100%", height: h, border: 0, backgroundColor: "transparent" }} />;
}

function BarChart({ data, height, labelEvery }) {
  const h = height || 120;
  const every = labelEvery || 1;
  const max = Math.max.apply(null, data.map((d) => d.value).concat([1]));
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: h, gap: 3 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: h }}>
            <View style={{ width: "100%", height: Math.max(4, (Number(d.value || 0) / max) * (h - 16)), backgroundColor: "#43A047", borderRadius: 3 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 3, marginTop: 6 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.chartLabel} numberOfLines={1}>{i % every === 0 ? d.label : " "}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ProgressRow({ label, valueText, ratio }) {
  const pct = Math.max(0, Math.min(1, Number(ratio || 0)));
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTop}>
        <Text style={styles.progressLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.progressValue}>{valueText}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: (pct * 100).toFixed(1) + "%" }]} />
      </View>
    </View>
  );
}

function Kpi({ title, value, pct, red }) {
  const { t } = useI18n();
  const up = pct !== null && pct >= 0;
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={[styles.kpiValue, red && styles.redText]}>{value}</Text>
      {pct !== null ? (
        <Text style={{ color: up ? "#16A34A" : "#EF4444", fontSize: 12, fontWeight: "bold" }}>
          {up ? "+" : ""}{pct.toFixed(2)}% {t("vsPrev")}
        </Text>
      ) : (
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>—</Text>
      )}
    </View>
  );
}

export default function BackOfficeScreen() {
  const { store } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const sym = settings.currencySymbol || "$";
  const dec = Number.isInteger(Number(settings.decimals)) ? Number(settings.decimals) : 2;
  const fm = (n) => sym + Number(n || 0).toFixed(dec);

  // Default to TODAY
  const todayStr = new Date().toISOString().split("T")[0];
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dash, setDash] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sales, setSales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [cashSummary, setCashSummary] = useState(null);
  const [cashMoves, setCashMoves] = useState([]);
  const [zr, setZr] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const range = { from: fromDate, to: toDate };
      const [d, s, sl, tp, pm, cr, hr, cs, cm, zrData] = await Promise.all([
        reportsApi.getDashboard(range, settings.businessHours).catch(() => null),
        backofficeApi.getSummary(range),
        backofficeApi.getSales(range),
        backofficeApi.getTopProducts(range),
        backofficeApi.getPayments(range),
        backofficeApi.getCategoriesReport(range),
        backofficeApi.getHourly(range),
        backofficeApi.getCashSummary(range),
        backofficeApi.getCashMovements(range),
        backofficeApi.getZReport(range),
      ]);
      setDash(d);
      setSummary(s);
      setSales(sl || []);
      setTopProducts(tp || []);
      setPayments(pm || []);
      setCategories(cr || []);
      setHourly(hr || []);
      setCashSummary(cs || null);
      setCashMoves(cm || []);
      setZr(zrData || null);
    } catch (error) {
      console.error("Back office load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  const c = dash ? dash.current : null;
  const pv = dash ? dash.previous : null;
  const net = c ? c.gross_sales - c.discounts : 0;
  const netPrev = pv ? pv.gross_sales - pv.discounts : 0;

  // Preset: set date range
  const applyPreset = (preset) => {
    const end = new Date();
    const start = new Date();
    if (preset === "today") {
      // Both = today
    } else if (preset === "7") {
      start.setDate(start.getDate() - 6);
    } else if (preset === "30") {
      start.setDate(start.getDate() - 29);
    }
    setFromDate(start.toISOString().split("T")[0]);
    setToDate(end.toISOString().split("T")[0]);
  };

  // ========== EXPORT FULL CSV ==========
  const exportFullCsv = () => {
    const rows = [];
    rows.push("REPORT SUMMARY");
    rows.push("Store," + (store ? store.name : ""));
    rows.push("Period," + fromDate + " to " + toDate);
    rows.push("Generated," + new Date().toLocaleString());
    rows.push("");
    rows.push("SUMMARY");
    rows.push("Metric,Current Period,Previous Period,Change %");
    if (c) {
      rows.push("Gross Sales," + c.gross_sales.toFixed(2) + "," + (pv ? pv.gross_sales.toFixed(2) : "0") + "," + (pv && pctChange(c.gross_sales, pv.gross_sales) !== null ? pctChange(c.gross_sales, pv.gross_sales).toFixed(2) : "N/A"));
      rows.push("Refunds," + c.refunds.toFixed(2) + "," + (pv ? pv.refunds.toFixed(2) : "0") + "," + (pv && pctChange(c.refunds, pv.refunds) !== null ? pctChange(c.refunds, pv.refunds).toFixed(2) : "N/A"));
      rows.push("Discounts," + c.discounts.toFixed(2) + "," + (pv ? pv.discounts.toFixed(2) : "0") + "," + (pv && pctChange(c.discounts, pv.discounts) !== null ? pctChange(c.discounts, pv.discounts).toFixed(2) : "N/A"));
      rows.push("Net Sales," + net.toFixed(2) + "," + netPrev.toFixed(2) + "," + (pv && pctChange(net, netPrev) !== null ? pctChange(net, netPrev).toFixed(2) : "N/A"));
      rows.push("Orders," + c.order_count + "," + (pv ? pv.order_count : "0") + "," + (pv && pctChange(c.order_count, pv.order_count) !== null ? pctChange(c.order_count, pv.order_count).toFixed(2) : "N/A"));
    }
    rows.push("");
    rows.push("DAILY SALES");
    rows.push("Date,Gross Sales,Discounts,Orders");
    (dash ? dash.daily : []).forEach((r) => {
      rows.push(r.label + "," + r.gross.toFixed(2) + "," + r.discounts.toFixed(2) + "," + r.orders);
    });
    rows.push("");
    if (zr) {
      rows.push("Z-REPORT");
      rows.push("Gross Sales," + zr.gross_sales.toFixed(2));
      rows.push("Discounts,-" + zr.discounts.toFixed(2));
      rows.push("Net Sales," + zr.net_sales.toFixed(2));
      rows.push("Tax Amount," + zr.tax_amount.toFixed(2));
      rows.push("Refunds,-" + zr.refunds.toFixed(2));
      rows.push("Cash Sales," + zr.cash_sales.toFixed(2));
      rows.push("Card Sales," + zr.card_sales.toFixed(2));
      rows.push("Cash In,+" + zr.cash_in.toFixed(2));
      rows.push("Cash Out,-" + zr.cash_out.toFixed(2));
      rows.push("Expected Cash," + zr.expected_cash.toFixed(2));
      rows.push("");
    }
    if (topProducts && topProducts.length > 0) {
      rows.push("TOP PRODUCTS");
      rows.push("Rank,Product,Quantity,Revenue");
      topProducts.forEach((p, i) => {
        rows.push((i + 1) + ',"' + p.name.replace(/"/g, '""') + '",' + p.quantity + "," + p.revenue.toFixed(2));
      });
      rows.push("");
    }
    if (categories && categories.length > 0) {
      rows.push("CATEGORY PERFORMANCE");
      rows.push("Category,Revenue");
      categories.forEach((cc) => {
        rows.push('"' + cc.name.replace(/"/g, '""') + '",' + cc.revenue.toFixed(2));
      });
      rows.push("");
    }
    if (payments && payments.length > 0) {
      rows.push("PAYMENT METHODS");
      rows.push("Method,Count,Amount");
      payments.forEach((p) => {
        rows.push(p.method + "," + p.count + "," + p.amount.toFixed(2));
      });
      rows.push("");
    }
    if (cashMoves && cashMoves.length > 0) {
      rows.push("CASH MOVEMENTS");
      rows.push("Date,Type,Amount,Note");
      cashMoves.forEach((m) => {
        rows.push('"' + new Date(m.created_at).toLocaleString() + '",' + m.type + "," + m.amount.toFixed(2) + ',"' + (m.note || "").replace(/"/g, '""') + '"');
      });
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report-" + fromDate + "-to-" + toDate + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ========== THERMAL 80MM PRINT ==========
  const printThermalReport = () => {
    const thermalCss =
      "@page { size: 80mm auto; margin: 0; }" +
      "html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
      "body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; width: 80mm; box-sizing: border-box; font-weight: bold; }" +
      ".page { padding: 3mm; }" +
      ".center { text-align: center; }" +
      ".bold { font-weight: bold; }" +
      ".big { font-size: 17px; font-weight: bold; }" +
      ".title { font-size: 14px; font-weight: bold; text-align: center; margin: 3mm 0 2mm; border-bottom: 2px solid #000; padding-bottom: 2mm; }" +
      ".line { border-top: 2px solid #000; margin: 2mm 0; }" +
      ".row { display: flex; justify-content: space-between; padding: 1px 0; font-weight: bold; }" +
      ".row span:last-child { text-align: right; }" +
      ".section { margin-top: 2mm; }" +
      ".section-title { font-weight: bold; text-decoration: underline; margin-bottom: 1mm; font-size: 13px; }" +
      ".small { font-size: 10px; font-weight: bold; }" +
      ".footer { text-align: center; margin-top: 3mm; font-size: 10px; border-top: 2px solid #000; padding-top: 2mm; font-weight: bold; }";

    const now = new Date();
    const dateStr = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const storeName = store ? store.name : "YourPOS";
    const periodLabel = fromDate + " to " + toDate;

    let html = "<html><head><style>" + thermalCss + "</style></head><body><div class='page'>";
    html += "<div class='center big'>" + storeName + "</div>";
    html += "<div class='center bold'>REPORT</div>";
    html += "<div class='center small'>" + periodLabel + "</div>";
    html += "<div class='center small'>" + dateStr + "</div>";
    html += "<div class='line'></div>";

    if (c) {
      html += "<div class='section-title'>SUMMARY</div>";
      html += "<div class='row'><span>Gross Sales:</span><span>" + fm(c.gross_sales) + "</span></div>";
      html += "<div class='row'><span>Net Sales:</span><span>" + fm(net) + "</span></div>";
      html += "<div class='row'><span>Orders:</span><span>" + c.order_count + "</span></div>";
      html += "<div class='row'><span>Discounts:</span><span>" + fm(c.discounts) + "</span></div>";
      html += "<div class='row'><span>Refunds:</span><span>" + fm(c.refunds) + "</span></div>";
      html += "<div class='line'></div>";
    }

    if (zr) {
      html += "<div class='section-title'>Z-REPORT</div>";
      html += "<div class='row'><span>Cash Sales:</span><span>" + fm(zr.cash_sales) + "</span></div>";
      html += "<div class='row'><span>Card Sales:</span><span>" + fm(zr.card_sales) + "</span></div>";
      html += "<div class='row'><span>Cash In:</span><span>+" + fm(zr.cash_in) + "</span></div>";
      html += "<div class='row'><span>Cash Out:</span><span>-" + fm(zr.cash_out) + "</span></div>";
      html += "<div class='line'></div>";
      html += "<div class='row bold'><span>CASH DRAWER:</span><span>" + fm(zr.expected_cash) + "</span></div>";
      html += "<div class='line'></div>";
    }

    if (topProducts && topProducts.length > 0) {
      html += "<div class='section-title'>TOP " + Math.min(5, topProducts.length) + " PRODUCTS</div>";
      topProducts.slice(0, 5).forEach((p, i) => {
        const name = p.name.length > 18 ? p.name.substring(0, 18) + ".." : p.name;
        html += "<div class='row'><span>" + (i + 1) + ". " + name + "</span><span>" + p.quantity + "x " + fm(p.revenue) + "</span></div>";
      });
      html += "<div class='line'></div>";
    }

    if (payments && payments.length > 0) {
      html += "<div class='section-title'>PAYMENTS</div>";
      payments.forEach((p) => {
        html += "<div class='row'><span>" + p.method.toUpperCase() + " (" + p.count + "x)</span><span>" + fm(p.amount) + "</span></div>";
      });
      html += "<div class='line'></div>";
    }

    if (cashSummary) {
      html += "<div class='section-title'>CASH DRAWER</div>";
      html += "<div class='row'><span>Cash In:</span><span>+" + fm(cashSummary.cash_in) + "</span></div>";
      html += "<div class='row'><span>Cash Out:</span><span>-" + fm(cashSummary.cash_out) + "</span></div>";
      html += "<div class='row bold'><span>Net:</span><span>" + fm(cashSummary.net) + "</span></div>";
      html += "<div class='line'></div>";
    }

    html += "<div class='footer'>*** END OF REPORT ***<br/>Thank you!</div>";
    html += "</div></body></html>";

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
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
    }, 500);
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch (e) {}
    }, 60000);
  };

  // ========== PRINT A4 REPORT ==========
  const printReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      Alert.alert("Error", "Please allow popups to print reports");
      return;
    }
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Report - ${store ? store.name : "YourPOS"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; color: #0F172A; font-size: 14px; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #0F172A; padding-bottom: 20px; }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .header p { color: #64748B; font-size: 14px; margin-top: 5px; }
    .section { margin-bottom: 30px; page-break-inside: avoid; }
    .section h2 { font-size: 18px; color: #0F172A; margin-bottom: 15px; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .kpi-card { background: #F8FAFC; padding: 12px; border-radius: 8px; border: 1px solid #E2E8F0; }
    .kpi-label { color: #64748B; font-size: 11px; margin-bottom: 4px; text-transform: uppercase; }
    .kpi-value { font-size: 22px; font-weight: bold; color: #0F172A; }
    .kpi-change { font-size: 11px; margin-top: 4px; }
    .up { color: #16A34A; }
    .down { color: #EF4444; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #E2E8F0; }
    th { background: #F8FAFC; font-weight: bold; color: #475569; font-size: 12px; }
    .total-row { background: #DCFCE7; font-weight: bold; }
    .red { color: #EF4444; }
    .green { color: #16A34A; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #E2E8F0; color: #94A3B8; font-size: 11px; }
    @media print {
      body { padding: 10mm; font-size: 12px; }
      .kpi-value { font-size: 18px; }
      .section h2 { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${store ? store.name : "YourPOS"}</h1>
    <p><strong>Sales Report — ${fromDate} to ${toDate}</strong></p>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
  ${c ? `
  <div class="section">
    <h2>Summary</h2>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Gross Sales</div>
        <div class="kpi-value">${fm(c.gross_sales)}</div>
        ${pv && pctChange(c.gross_sales, pv.gross_sales) !== null ? `<div class="kpi-change ${pctChange(c.gross_sales, pv.gross_sales) >= 0 ? 'up' : 'down'}">${pctChange(c.gross_sales, pv.gross_sales).toFixed(1)}% vs previous</div>` : ''}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Sales</div>
        <div class="kpi-value">${fm(net)}</div>
        ${pv && pctChange(net, netPrev) !== null ? `<div class="kpi-change ${pctChange(net, netPrev) >= 0 ? 'up' : 'down'}">${pctChange(net, netPrev).toFixed(1)}% vs previous</div>` : ''}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Orders</div>
        <div class="kpi-value">${c.order_count}</div>
        ${pv && pctChange(c.order_count, pv.order_count) !== null ? `<div class="kpi-change ${pctChange(c.order_count, pv.order_count) >= 0 ? 'up' : 'down'}">${pctChange(c.order_count, pv.order_count).toFixed(1)}% vs previous</div>` : ''}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Discounts</div>
        <div class="kpi-value red">${fm(c.discounts)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Refunds</div>
        <div class="kpi-value red">${fm(c.refunds)}</div>
      </div>
    </div>
  </div>
  ` : ''}
  ${dash && dash.daily && dash.daily.length > 0 ? `
  <div class="section">
    <h2>Daily Sales Breakdown</h2>
    <table>
      <thead><tr><th>Date</th><th>Gross Sales</th><th>Discounts</th><th>Orders</th></tr></thead>
      <tbody>
        ${dash.daily.slice().reverse().map(r => `
          <tr><td>${r.label}</td><td>${fm(r.gross)}</td><td class="red">${fm(r.discounts)}</td><td>${r.orders}</td></tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  ${zr ? `
  <div class="section">
    <h2>Z-Report Summary</h2>
    <table>
      <tbody>
        <tr><td>Gross Sales</td><td style="text-align:right">${fm(zr.gross_sales)}</td></tr>
        <tr><td>Discounts</td><td style="text-align:right" class="red">-${fm(zr.discounts)}</td></tr>
        <tr><td>Net Sales</td><td style="text-align:right">${fm(zr.net_sales)}</td></tr>
        <tr><td>Tax (${zr.tax_rate}%)</td><td style="text-align:right">${fm(zr.tax_amount)}</td></tr>
        <tr><td>Refunds</td><td style="text-align:right" class="red">-${fm(zr.refunds)}</td></tr>
        <tr><td colspan="2" style="height:8px; border:none"></td></tr>
        <tr><td>Cash Sales</td><td style="text-align:right">${fm(zr.cash_sales)}</td></tr>
        <tr><td>Card Sales</td><td style="text-align:right">${fm(zr.card_sales)}</td></tr>
        <tr><td>Cash In</td><td style="text-align:right" class="green">+${fm(zr.cash_in)}</td></tr>
        <tr><td>Cash Out</td><td style="text-align:right" class="red">-${fm(zr.cash_out)}</td></tr>
        <tr class="total-row"><td><strong>Expected Cash in Drawer</strong></td><td style="text-align:right"><strong>${fm(zr.expected_cash)}</strong></td></tr>
      </tbody>
    </table>
  </div>
  ` : ''}
  ${topProducts && topProducts.length > 0 ? `
  <div class="section">
    <h2>Top Products</h2>
    <table>
      <thead><tr><th style="width:60px">Rank</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Revenue</th></tr></thead>
      <tbody>
        ${topProducts.slice(0, 20).map((p, i) => `
          <tr><td><strong>${i + 1}</strong></td><td>${p.name}</td><td style="text-align:right">${p.quantity}</td><td style="text-align:right">${fm(p.revenue)}</td></tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  ${categories && categories.length > 0 ? `
  <div class="section">
    <h2>Category Performance</h2>
    <table>
      <thead><tr><th>Category</th><th style="text-align:right">Revenue</th></tr></thead>
      <tbody>
        ${categories.map(cc => `<tr><td>${cc.name}</td><td style="text-align:right">${fm(cc.revenue)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  ${payments && payments.length > 0 ? `
  <div class="section">
    <h2>Payment Methods</h2>
    <table>
      <thead><tr><th>Method</th><th style="text-align:right">Transactions</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        ${payments.map(p => `<tr><td>${p.method.toUpperCase()}</td><td style="text-align:right">${p.count}</td><td style="text-align:right">${fm(p.amount)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  <div class="footer">
    <p><strong>Report generated by YourPOS</strong></p>
    <p>${new Date().toLocaleString()}</p>
  </div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }</script>
</body>
</html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const hourlyChartData = [];
  for (let h = 0; h < 24; h++) {
    const found = (hourly || []).find((row) => Number(row.hour) === h);
    hourlyChartData.push({
      label: h === 0 ? "12a" : h < 12 ? h + "a" : h === 12 ? "12p" : (h - 12) + "p",
      value: found ? Number(found.revenue || 0) : 0,
    });
  }

  const paymentsTotal = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const categoriesMax = Math.max.apply(null, (categories || []).map((cc) => Number(cc.revenue || 0)).concat([1]));
  const topProductsMax = Math.max.apply(null, (topProducts || []).map((p) => Number(p.revenue || 0)).concat([1]));

  // Check if a preset is active
  const isToday = fromDate === toDate && fromDate === todayStr;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>{t("backOffice")}</Text>
      </View>

      {/* DATE RANGE SELECTOR */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 Select Date Range</Text>
        
        {/* Quick Presets */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <TouchableOpacity
            style={[styles.presetBtn, isToday && styles.presetBtnActive]}
            onPress={() => applyPreset("today")}
          >
            <Text style={[styles.presetBtnText, isToday && styles.presetBtnTextActive]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.presetBtn, false && styles.presetBtnActive]}
            onPress={() => applyPreset("7")}
          >
            <Text style={styles.presetBtnText}>Last 7 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.presetBtn, false && styles.presetBtnActive]}
            onPress={() => applyPreset("30")}
          >
            <Text style={styles.presetBtnText}>Last 30 Days</Text>
          </TouchableOpacity>
        </View>

        {/* Date Pickers */}
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "600", marginBottom: 4 }}>From Date</Text>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, color: "#0F172A", backgroundColor: "#fff", boxSizing: "border-box" }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "600", marginBottom: 4 }}>To Date</Text>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, color: "#0F172A", backgroundColor: "#fff", boxSizing: "border-box" }}
            />
          </View>
          <TouchableOpacity
            style={{ backgroundColor: "#43A047", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, alignSelf: "flex-end" }}
            onPress={loadAll}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>🔄 Load</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ACTION BUTTONS */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <TouchableOpacity
          style={{ flex: 1, minWidth: 130, backgroundColor: "#EF4444", borderRadius: 10, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
          onPress={printThermalReport}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>🧾 Thermal 80mm</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, minWidth: 130, backgroundColor: "#43A047", borderRadius: 10, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
          onPress={printReport}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>🖨️ Print A4</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, minWidth: 130, backgroundColor: "#0F172A", borderRadius: 10, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
          onPress={exportFullCsv}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>📥 Export CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, minWidth: 130, backgroundColor: "#0088cc", borderRadius: 10, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
          onPress={async () => {
            try {
              await telegramApi.sendReport(7, settings.currencySymbol);
              Alert.alert("✅", t("telegramSent"));
            } catch (e) {
              Alert.alert("❌", e.response?.data?.error || e.message);
            }
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>📲 Telegram</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#43A047" /></View>
      ) : (
        <>
          {/* KPI ROW */}
          <View style={styles.kpiRow}>
            <Kpi title={t("grossSales")} value={fm(c ? c.gross_sales : 0)} pct={c && pv ? pctChange(c.gross_sales, pv.gross_sales) : null} />
            <Kpi title={t("refunds")} value={fm(c ? c.refunds : 0)} pct={c && pv ? pctChange(c.refunds, pv.refunds) : null} red />
            <Kpi title={t("discounts")} value={fm(c ? c.discounts : 0)} pct={c && pv ? pctChange(c.discounts, pv.discounts) : null} red />
            <Kpi title={t("netSales")} value={fm(net)} pct={c && pv ? pctChange(net, netPrev) : null} />
            <Kpi title={t("ordersCount")} value={String(c ? c.order_count : 0)} pct={c && pv ? pctChange(c.order_count, pv.order_count) : null} />
          </View>

          {/* LINE CHART */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("grossSales")}</Text>
            {(() => {
              const series = (dash ? dash.daily : []).map(r => ({ label: r.label, gross: r.gross }));
              return <LineChart data={series} />;
            })()}
          </View>

          {/* DAILY TABLE */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("exportDaily")}</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.tableCell, styles.tableHeadCell]}>Date</Text>
              <Text style={[styles.tableCell, styles.tableHeadCell]}>{t("grossSales")}</Text>
              <Text style={[styles.tableCell, styles.tableHeadCell]}>{t("discounts")}</Text>
              <Text style={[styles.tableCell, styles.tableHeadCell]}>{t("ordersCount")}</Text>
            </View>
            {(dash ? dash.daily : []).slice().reverse().map((r, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableCell}>{r.label}</Text>
                <Text style={styles.tableCell}>{fm(r.gross)}</Text>
                <Text style={styles.tableCell}>{fm(r.discounts)}</Text>
                <Text style={styles.tableCell}>{r.orders}</Text>
              </View>
            ))}
          </View>

          {/* Z-REPORT */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("zReportTitle")}</Text>
            {zr ? (
              <View>
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("grossSales")}</Text><Text style={styles.zValue}>{fm(zr.gross_sales)}</Text></View>
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("discounts")}</Text><Text style={[styles.zValue, styles.redText]}>-{fm(zr.discounts)}</Text></View>
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("netSales")}</Text><Text style={styles.zValue}>{fm(zr.net_sales)}</Text></View>
                <View style={styles.zRow}>
                  <Text style={styles.zLabel}>{zr.vat_mode === "incl" ? t("vatIncl") : t("vatExcl")} ({zr.tax_rate}%)</Text>
                  <Text style={styles.zValue}>{fm(zr.tax_amount)}</Text>
                </View>
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("refunds")}</Text><Text style={[styles.zValue, styles.redText]}>-{fm(zr.refunds)}</Text></View>
                {(zr.dining || []).map((d, i) => (
                  <View key={i} style={styles.zRow}>
                    <Text style={styles.zLabel}>{d.dining_option === "takeaway" ? "🥡 " + t("takeaway") : "🍽 " + t("dineIn")} ({d.count})</Text>
                    <Text style={styles.zValue}>{fm(d.amount)}</Text>
                  </View>
                ))}
                <View style={styles.zDivider} />
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("cashSales")}</Text><Text style={styles.zValue}>{fm(zr.cash_sales)}</Text></View>
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("cardSales")}</Text><Text style={styles.zValue}>{fm(zr.card_sales)}</Text></View>
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("cashInPlus")}</Text><Text style={[styles.zValue, { color: "#16A34A" }]}>+{fm(zr.cash_in)}</Text></View>
                <View style={styles.zRow}><Text style={styles.zLabel}>{t("cashOutMinus")}</Text><Text style={[styles.zValue, styles.redText]}>-{fm(zr.cash_out)}</Text></View>
                <View style={styles.zDivider} />
                <View style={styles.zFinalRow}>
                  <Text style={styles.zFinalLabel}>{t("cashInDrawer")}</Text>
                  <Text style={styles.zFinalValue}>{fm(zr.expected_cash)}</Text>
                </View>
                <Text style={styles.zHint}>{t("zHint")}</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>{t("loadingReport")}</Text>
            )}
          </View>

          {/* PAYMENTS */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("payments")}</Text>
            {(payments || []).length === 0 ? (
              <Text style={styles.emptyText}>{t("noPayments")}</Text>
            ) : (
              (payments || []).map((p, i) => (
                <ProgressRow key={i} label={String(p.method).toUpperCase() + " (" + p.count + "x)"} valueText={fm(p.amount)} ratio={paymentsTotal > 0 ? Number(p.amount || 0) / paymentsTotal : 0} />
              ))
            )}
          </View>

          {/* CASH DRAWER */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("cashDrawer")}</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryBox}>
                <Text style={[styles.summaryValue, { color: "#16A34A" }]}>{fm(cashSummary ? cashSummary.cash_in : 0)}</Text>
                <Text style={styles.summaryLabel}>{t("cashIn")}</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={[styles.summaryValue, styles.redText]}>{fm(cashSummary ? cashSummary.cash_out : 0)}</Text>
                <Text style={styles.summaryLabel}>{t("cashOut")}</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryValue}>{fm(cashSummary ? cashSummary.net : 0)}</Text>
                <Text style={styles.summaryLabel}>{t("net")}</Text>
              </View>
            </View>
            {(cashMoves || []).length === 0 ? (
              <Text style={styles.emptyText}>{t("noCashMoves")}</Text>
            ) : (
              (cashMoves || []).slice(0, 10).map((m, i) => (
                <View key={i} style={styles.cashMoveRow}>
                  <Text style={styles.cashMoveIcon}>{m.type === "cash_in" ? "🟢" : "🔴"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cashMoveNote} numberOfLines={1}>{m.note || (m.type === "cash_in" ? t("cashIn") : t("cashOut"))}</Text>
                    <Text style={styles.cashMoveDate}>{new Date(m.created_at).toLocaleString()}</Text>
                  </View>
                  <Text style={[styles.cashMoveAmount, m.type === "cash_out" && styles.redText]}>
                    {m.type === "cash_in" ? "+" : "-"}{fm(m.amount)}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* TOP PRODUCTS */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("topProducts")}</Text>
            {(topProducts || []).length === 0 ? (
              <Text style={styles.emptyText}>{t("noProductSales")}</Text>
            ) : (
              (topProducts || []).map((p, i) => (
                <View key={i} style={styles.rankRow}>
                  <Text style={styles.rankNumber}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
                    <ProgressRow label="" valueText={fm(p.revenue) + " • " + p.quantity} ratio={Number(p.revenue || 0) / topProductsMax} />
                  </View>
                </View>
              ))
            )}
          </View>

          {/* CATEGORIES */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("categoryPerformance")}</Text>
            {(categories || []).length === 0 ? (
              <Text style={styles.emptyText}>{t("noCategorySales")}</Text>
            ) : (
              (categories || []).map((cc, i) => (
                <ProgressRow key={i} label={cc.name} valueText={fm(cc.revenue)} ratio={Number(cc.revenue || 0) / categoriesMax} />
              ))
            )}
          </View>

          {/* PEAK HOURS */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("peakHours")}</Text>
            <BarChart data={hourlyChartData} height={100} labelEvery={4} />
          </View>

          <Text style={styles.footerText}>{store ? store.name : ""} • {t("reportsRealtime")}</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  content: { padding: 16, paddingBottom: 40, width: "100%", maxWidth: 1000, alignSelf: "center" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  screenTitle: { fontSize: 22, fontWeight: "bold", color: "#0F172A" },
  center: { paddingVertical: 60, alignItems: "center" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 14 },
  emptyText: { color: "#94A3B8", textAlign: "center", paddingVertical: 16 },
  presetBtn: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#fff" },
  presetBtnActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  presetBtnText: { color: "#334155", fontWeight: "600", fontSize: 13 },
  presetBtnTextActive: { color: "#fff" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  kpiCard: { flex: 1, minWidth: 170, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 14 },
  kpiTitle: { color: "#64748B", fontSize: 13, marginBottom: 6 },
  kpiValue: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 4 },
  redText: { color: "#EF4444" },
  exportBtn: { backgroundColor: "#0F172A", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  exportBtnText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  tableHead: { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: "#E2E8F0", paddingVertical: 8 },
  tableHeadCell: { color: "#64748B", fontWeight: "bold", fontSize: 12 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingVertical: 10 },
  tableCell: { flex: 1, fontSize: 13, color: "#0F172A" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryBox: { width: "48%", backgroundColor: "#F8FAFC", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  summaryValue: { fontSize: 20, fontWeight: "bold", color: "#0F172A" },
  summaryLabel: { color: "#64748B", fontSize: 13, marginTop: 4 },
  chartLabel: { fontSize: 10, color: "#94A3B8" },
  progressRow: { marginBottom: 12 },
  progressTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  progressLabel: { color: "#334155", fontSize: 14, fontWeight: "600", flex: 1 },
  progressValue: { color: "#0F172A", fontSize: 14, fontWeight: "bold" },
  progressTrack: { height: 8, backgroundColor: "#F1F5F9", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: "#43A047", borderRadius: 4 },
  rankRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 12 },
  rankNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#0F172A", color: "#fff", fontWeight: "bold", textAlign: "center", lineHeight: 28 },
  rankName: { fontSize: 15, fontWeight: "600", color: "#0F172A", marginBottom: 4 },
  footerText: { textAlign: "center", color: "#94A3B8", fontSize: 12, marginTop: 6 },
  cashMoveRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  cashMoveIcon: { fontSize: 14 },
  cashMoveNote: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  cashMoveDate: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  cashMoveAmount: { fontSize: 14, fontWeight: "bold", color: "#16A34A" },
  zRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  zLabel: { color: "#475569", fontSize: 14 },
  zValue: { color: "#0F172A", fontSize: 14, fontWeight: "bold" },
  zDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8 },
  zFinalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#DCFCE7", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  zFinalLabel: { color: "#166534", fontWeight: "bold", fontSize: 15 },
  zFinalValue: { color: "#166534", fontWeight: "bold", fontSize: 22 },
  zHint: { color: "#94A3B8", fontSize: 11, marginTop: 6 },
});