import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { ordersApi } from "../api/orders";
import { getOfflineOrders } from "../services/offlineQueue";
import ConfirmModal from "../components/ConfirmModal";
import { useAuth } from "../auth/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { useRights } from "../auth/RightsContext";
import { printReceipt } from "../services/printerService";

function formatDate(dateString) {
  try {
    return new Date(dateString).toLocaleString();
  } catch (error) {
    return dateString;
  }
}

export default function OrdersScreen() {
  const { store } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const { can } = useRights();

  const sym = settings.currencySymbol || "$";
  const dec = Number.isInteger(Number(settings.decimals)) ? Number(settings.decimals) : 2;
  const fm = (n) => sym + Number(n || 0).toFixed(dec);

  const [pendingOrders, setPendingOrders] = useState([]);
  const [syncedOrders, setSyncedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);
  const [infoMessage, setInfoMessage] = useState("");

  const getStatusLabel = (status) => {
    if (status === "completed") return t("statusCompleted");
    if (status === "refunded") return t("statusRefunded");
    if (status === "partially_refunded") return t("statusPartial");
    if (status === "offline_pending") return t("statusPendingSync");
    return status;
  };

  const getStatusStyle = (status) => {
    if (status === "refunded") return styles.statusRefunded;
    if (status === "offline_pending") return styles.statusPending;
    return styles.statusCompleted;
  };

  const loadOrders = useCallback(async () => {
    try {
      const offlineOrders = await getOfflineOrders();
      const mappedPending = offlineOrders.map((order) => ({
        id: order.client_order_id,
        client_order_id: order.client_order_id,
        created_at: order.created_at,
        status: "offline_pending",
        total_amount: order.total_amount,
        payment_method: order.payment_method || "cash",
        item_count: order.items ? order.items.length : 0,
        isPending: true,
      }));
      setPendingOrders(mappedPending);
      const data = await ordersApi.getOrders(50);
      setSyncedOrders(data);
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const handleRefund = (order) => {
    if (order.isPending) {
      setInfoMessage(t("cannotRefund"));
      return;
    }
    if (order.status === "refunded") {
      setInfoMessage(t("alreadyRefunded"));
      return;
    }
    setRefundTarget(order);
  };

  const confirmRefund = async () => {
    if (!refundTarget) return;
    try {
      await ordersApi.refundOrder(refundTarget.id, "Refunded from POS");
      setRefundTarget(null);
      await loadOrders();
    } catch (error) {
      setRefundTarget(null);
      setInfoMessage(t("refundOrder") + ": " + (error.response?.data?.error || error.message));
    }
  };

    const pick = (obj, keys) => {
    for (const k of keys) {
      const v = obj ? obj[k] : undefined;
      if (v !== undefined && v !== null && v !== "") return Number(v);
    }
    return 0;
  };

  const handlePrint = async (order) => {
    try {
      const full = await ordersApi.getOrderDetail(order.id);
      const total = pick(full, ["total_amount", "total", "amount", "grand_total"]) || Number(order.total_amount || 0);
      const tax = pick(full, ["tax_amount", "tax", "vat_amount"]);
      const discount = pick(full, ["discount_amount", "discount"]);
      const subtotal = pick(full, ["subtotal_amount", "subtotal", "sub_total"]) || (total - tax);

      let items = full.items || [];
      if (typeof items === "string") { try { items = JSON.parse(items); } catch (e) { items = []; } }
      items = (items || [])
        .filter((it) => it && (it.name || it.product_name))
        .map((it) => ({
          name: it.name || it.product_name || "Item",
          description: it.description,
          quantity: Number(it.quantity || 1),
          price: Number(it.price !== undefined ? it.price : it.unit_price || 0),
          modifiers: it.modifiers || [],
        }));

      const result = await printReceipt({
        items,
        subtotal,
        tax,
        total,
        discount,
        duplicate: true,
        payment: {
          payment_method: full.payment_method || order.payment_method || "cash",
          amount_tendered: pick(full, ["amount_tendered", "tendered"]) || total,
          change_due: pick(full, ["change_due", "change"]),
          payments: [{ method: full.payment_method || order.payment_method || "cash", amount: total }],
        },
        store,
        settings,
        orderId: full.client_order_id || order.client_order_id || full.id,
        billNumber: full.bill_number || full.bill_no || full.invoice_no || order.bill_number || null,
		createdAt: full.created_at || order.created_at,
		duplicate: true,
        dining: full.dining_option || order.dining_option,
        table: full.table_name || order.table_name,
      });
      if (!result.success) {
        window.alert(t("reprintFailed") + ": " + (result.error || ""));
      }
    } catch (error) {
      window.alert(t("reprintFailed") + ": " + (error.response?.data?.error || error.message));
    }
  };

  const renderOrder = ({ item }) => {
    const canRefund =
      can("refunds") && !item.isPending && item.status !== "refunded" && Number(item.total_amount) > 0;
    return (
      <View style={styles.orderCard}>
        <View style={styles.orderTopRow}>
          <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          <Text style={[styles.statusBadge, getStatusStyle(item.status)]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
        <View style={styles.orderMiddleRow}>
          <Text style={styles.orderTotal}>{fm(item.total_amount)}</Text>
          <View style={styles.payChip}>
            <Text style={styles.payChipText}>{(item.payment_method || "cash").toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.orderBottomRow}>
          <Text style={styles.orderMeta}>{item.item_count || 0} {t("items")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {!item.isPending ? (
              <TouchableOpacity style={styles.printButton} onPress={() => handlePrint(item)}>
                <Text style={styles.printButtonText}>🖨 {t("copyBill")}</Text>
              </TouchableOpacity>
            ) : null}
            {canRefund ? (
              <TouchableOpacity style={styles.refundButton} onPress={() => handleRefund(item)}>
                <Text style={styles.refundButtonText}>{t("refund")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const allOrders = [...pendingOrders, ...syncedOrders];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#43A047" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={allOrders}
        keyExtractor={(item) => item.client_order_id || String(item.id)}
        renderItem={renderOrder}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>{t("receipts")}</Text>
            <Text style={styles.headerCount}>{allOrders.length} {t("ordersLabel")}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t("noOrdersFound")}</Text>
          </View>
        }
      />
      <ConfirmModal
        visible={Boolean(refundTarget)}
        title={t("refundOrder")}
        message={t("refundMsg") + " (" + fm(refundTarget ? refundTarget.total_amount : 0) + ")"}
        confirmText={t("refund")}
        onConfirm={confirmRefund}
        onCancel={() => setRefundTarget(null)}
      />
      <ConfirmModal
        visible={Boolean(infoMessage)}
        title={t("notice")}
        message={infoMessage}
        confirmText={t("ok")}
        onConfirm={() => setInfoMessage("")}
        onCancel={() => setInfoMessage("")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F1F5F9" },
  listContent: { padding: 16, width: "100%", maxWidth: 900, alignSelf: "center" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#0F172A" },
  headerCount: { color: "#64748B", fontSize: 14 },
  orderCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 12 },
  orderTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  orderDate: { color: "#64748B", fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: "bold" },
  statusCompleted: { backgroundColor: "#DCFCE7", color: "#166534" },
  statusRefunded: { backgroundColor: "#FEE2E2", color: "#991B1B" },
  statusPending: { backgroundColor: "#FEF9C3", color: "#854D0E" },
  orderMiddleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  orderTotal: { fontSize: 22, fontWeight: "bold", color: "#0F172A" },
  payChip: { backgroundColor: "#F1F5F9", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  payChipText: { fontSize: 12, fontWeight: "bold", color: "#334155" },
  orderBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderMeta: { color: "#64748B", fontSize: 13 },
  printButton: { backgroundColor: "#0F172A", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  printButtonText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  refundButton: { backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  refundButtonText: { color: "#DC2626", fontWeight: "bold", fontSize: 13 },
  emptyContainer: { paddingVertical: 40, alignItems: "center" },
  emptyText: { color: "#64748B", textAlign: "center" },
});