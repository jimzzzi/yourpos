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

  const [days, setDays] = useState(7);
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
      const [d, s, sl, tp, pm, cr, hr, cs, cm, zrData] = await Promise.all([
        reportsApi.getDashboard(days, settings.businessHours).catch(() => null),
        backofficeApi.getSummary(days),
        backofficeApi.getSales(days),
        backofficeApi.getTopProducts(days),
        backofficeApi.getPayments(days),
        backofficeApi.getCategoriesReport(days),
        backofficeApi.getHourly(days),
        backofficeApi.getCashSummary(days),
        backofficeApi.getCashMovements(days),
        backofficeApi.getZReport(days),
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
  }, [days]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  const exportCsv = () => {
    const rows = ["date,gross_sales,discounts,orders"];
    (dash ? dash.daily : []).forEach((r) => rows.push(r.label + "," + r.gross.toFixed(2) + "," + r.discounts.toFixed(2) + "," + r.orders));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sales-" + days + "-days.csv";
    a.click();
  };

  const c = dash ? dash.current : null;
  const pv = dash ? dash.previous : null;
  const net = c ? c.gross_sales - c.discounts : 0;
  const netPrev = pv ? pv.gross_sales - pv.discounts : 0;

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>{t("backOffice")}</Text>
        <View style={styles.rangeRow}>
          {[{ d: 1, l: t("today") }, { d: 7, l: t("sevenDays") }, { d: 30, l: t("thirtyDays") }].map((opt) => (
            <TouchableOpacity key={opt.d} style={[styles.rangeButton, days === opt.d && styles.rangeButtonActive]} onPress={() => setDays(opt.d)}>
              <Text style={[styles.rangeText, days === opt.d && styles.rangeTextActive]}>{opt.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#43A047" /></View>
      ) : (
        <>
		          {/* TELEGRAM SEND */}
          <View style={{ marginBottom: 14 }}>
            <TouchableOpacity
              style={{ backgroundColor: "#0088cc", borderRadius: 10, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
              onPress={async () => {
                try {
                   await telegramApi.sendReport(days, settings.currencySymbol);
                  Alert.alert("✅", t("telegramSent"));
                } catch (e) {
                  Alert.alert("❌", e.response?.data?.error || e.message);
                }
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>📲 {t("sendReport")}</Text>
            </TouchableOpacity>
          </View>
          {/* KPI ROW — Loyverse style */}
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
              const series = [];
              const now = new Date();
              for (let i = days - 1; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                const label = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
                const found = (dash ? dash.daily : []).find((r) => r.label === label);
                series.push({ label: label, gross: found ? found.gross : 0 });
              }
              return <LineChart data={series} />;
            })()}
          </View>

          {/* EXPORT TABLE */}
          <View style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={styles.cardTitle}>{t("exportDaily")}</Text>
              <TouchableOpacity style={styles.exportBtn} onPress={exportCsv}>
                <Text style={styles.exportBtnText}>{t("exportCsv")}</Text>
              </TouchableOpacity>
            </View>
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
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeButton: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#fff" },
  rangeButtonActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  rangeText: { color: "#334155", fontWeight: "600", fontSize: 13 },
  rangeTextActive: { color: "#fff" },
  center: { paddingVertical: 60, alignItems: "center" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 14 },
  emptyText: { color: "#94A3B8", textAlign: "center", paddingVertical: 16 },
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