import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, TextInput } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { getPalette } from "../theme";
import { api } from "../api/client";
import { createOrder } from "../services/orderService";
import { printReceipt, printKitchenTicket, routeItemsForKitchen } from "../services/printerService";
import { nextReceiptNumber } from "../services/receiptCounter";

export default function TakeawayScreen() {
  const { user, store } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const p = getPalette(settings.darkMode);

  const dec = Number.isInteger(Number(settings.decimals)) ? Number(settings.decimals) : 2;
  const sym = settings.currencySymbol || "$";
  const fm = (n) => sym + Number(n || 0).toFixed(dec);
  const taxRate = Number(store?.tax_rate || 0) / 100;
  const vatInclusive = Boolean(store && store.tax_inclusive);

  const [orders, setOrders] = useState([]);
  const [payModalOrder, setPayModalOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [processing, setProcessing] = useState(false);

  const playOrderSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
      osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 1.0);
    } catch (e) {}
  };

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.get("/takeaway/orders");
        const data = Array.isArray(res.data) ? res.data : [];
        setOrders(data);
      } catch (e) {}
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []);

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const preparingCount = orders.filter((o) => o.status === "accepted").length;

  const timeAgo = (dateStr) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    return Math.floor(mins / 60) + " hr " + (mins % 60) + " min ago";
  };

  // ===== ACCEPT =====
  const handleAccept = async (orderId) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await api.put(`/takeaway/orders/${orderId}/accept`);
      const items = (order.items || []).map((i) => ({ ...i, name: i.name || "Item" }));
      const kpGroups = routeItemsForKitchen(items, settings);
      for (const g of kpGroups) {
        try {
          await printKitchenTicket({
            type: "NEW",
            table: "TAKEAWAY #" + String(order.id).padStart(4, "0"),
            billNumber: order.id,
            dining: "takeaway",
            items: g.items,
            settings,
            printer: g.printer,
          });
        } catch (e) { console.error("KOT print failed:", e); }
      }
      Alert.alert("✅", "Order #" + String(order.id).padStart(4, "0") + " accepted! KOT printed.");
    } catch (e) {
      Alert.alert("Error", e.response?.data?.error || e.message);
    }
  };

  // ===== CANCEL =====
  const handleCancel = async (orderId) => {
    if (!window.confirm("Cancel this takeaway order?")) return;
    try {
      await api.put(`/takeaway/orders/${orderId}/cancel`);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  // ===== OPEN PAYMENT =====
  const openPayment = (order) => {
    setPaymentMethod("cash");
    const total = Number(order.total || 0);
    setAmountTendered(total.toFixed(dec));
    setSplitCash((total / 2).toFixed(dec));
    setPayModalOrder(order);
  };

  const tenderedValue = Number(amountTendered || 0);
  const orderTotal = Number(payModalOrder?.total || 0);
  const changeDue = Math.max(0, tenderedValue - orderTotal);
  const splitCashNum = Number(splitCash || 0);
  const splitCard = Math.max(0, orderTotal - splitCashNum);

  const canConfirm = paymentMethod === "cash" ? tenderedValue >= orderTotal : paymentMethod === "card" ? true : splitCashNum > 0 && splitCashNum <= orderTotal;

  // ===== CONFIRM PAYMENT =====
  const confirmPayment = async () => {
    if (!payModalOrder || processing) return;
    setProcessing(true);
    try {
      const billNumber = await nextReceiptNumber(settings);

      let payment;
      if (paymentMethod === "cash") {
        payment = { payment_method: "cash", amount_tendered: tenderedValue, change_due: changeDue, payments: [{ method: "cash", amount: orderTotal }] };
      } else if (paymentMethod === "card") {
        payment = { payment_method: "card", amount_tendered: orderTotal, change_due: 0, payments: [{ method: "card", amount: orderTotal }] };
      } else {
        payment = { payment_method: "split", amount_tendered: orderTotal, change_due: 0, payments: [{ method: "cash", amount: splitCashNum }, { method: "card", amount: splitCard }] };
      }

      // Build cart items for createOrder
      const cartItems = (payModalOrder.items || []).map((i) => ({
        variant_id: i.variant_id,
        product_id: i.product_id,
        category_id: i.category_id,
        name: i.name || "Item",
        price: Number(i.price || 0),
        quantity: Number(i.quantity || 1),
        modifiers: i.modifiers || [],
        is_time_based: false,
      }));

      await createOrder({
        cart: cartItems,
        subtotal: Number(payModalOrder.subtotal || 0),
        tax: Number(payModalOrder.tax || 0),
        total: orderTotal,
        discount: 0,
        dining: "takeaway",
        table: null,
        user, store, payment,
      });

      // Mark takeaway complete
      await api.put(`/takeaway/orders/${payModalOrder.id}/complete`, { payment_method: payment.payment_method }).catch(() => {});

      // Print receipt only (NO KOT — already printed on accept)
      await printReceipt({
        items: cartItems,
        subtotal: Number(payModalOrder.subtotal || 0),
        tax: Number(payModalOrder.tax || 0),
        total: orderTotal,
        payment, store, settings,
        orderId: "TK-" + payModalOrder.id,
        dining: "takeaway",
        table: null,
        billNumber,
		customerName: payModalOrder.customer_name,
        customerPhone: payModalOrder.customer_phone,
        note: pay
      });

      // Open cash drawer if enabled
      const cd = settings.cashDrawer || {};
      if (cd.enabled && cd.autoOnCash !== false && payment.payment_method === "cash") {
        try { const mod = await import("../services/printerService"); await mod.openCashDrawer(settings); } catch (e) {}
      }

      setPayModalOrder(null);
      Alert.alert("✅", "Takeaway #" + String(payModalOrder.id).padStart(4, "0") + " completed!");
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={[s.container, { backgroundColor: p.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: p.surface, borderBottomColor: p.border }]}>
        <Text style={[s.title, { color: p.text }]}>🥡 Takeaway Orders</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {pendingCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>🟡 {pendingCount} Pending</Text>
            </View>
          )}
          {preparingCount > 0 && (
            <View style={[s.badge, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
              <Text style={[s.badgeText, { color: "#16A34A" }]}>🟢 {preparingCount} Preparing</Text>
            </View>
          )}
        </View>
      </View>

      {/* Orders List */}
      <ScrollView style={s.list} contentContainerStyle={{ padding: 15 }}>
        {orders.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 50, marginBottom: 10 }}>🥡</Text>
            <Text style={[s.emptyText, { color: p.muted }]}>No takeaway orders yet</Text>
            <Text style={[s.emptySub, { color: p.muted }]}>Orders will appear here when customers scan the Takeaway QR</Text>
          </View>
        ) : (
          orders.map((order) => {
            const isPending = order.status === "pending";
            return (
              <View key={order.id} style={[s.card, { backgroundColor: p.surface, borderColor: p.border }]}>
                {/* Status + Time */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <View style={{
                    backgroundColor: isPending ? "#FEF3C7" : "#DCFCE7",
                    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  }}>
                    <Text style={{ color: isPending ? "#92400E" : "#16A34A", fontSize: 11, fontWeight: "bold" }}>
                      {isPending ? "🟡 PENDING" : "🟢 PREPARING"}
                    </Text>
                  </View>
                  <Text style={{ color: p.muted, fontSize: 12 }}>
                    {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>

                {/* Customer Info */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={[s.orderNum, { color: p.accent }]}>#{String(order.id).padStart(4, "0")}</Text>
                  <Text style={{ color: p.text, fontSize: 14, fontWeight: "600" }}>👤 {order.customer_name || "Guest"}</Text>
                  {order.customer_phone ? <Text style={{ color: p.muted, fontSize: 13 }}>📞 {order.customer_phone}</Text> : null}
                </View>

                {/* Preparing time */}
                {!isPending && order.accepted_at ? (
                  <Text style={{ color: p.muted, fontSize: 12, marginBottom: 6 }}>
                    ⏳ Preparing since {timeAgo(order.accepted_at)}
                  </Text>
                ) : null}

                {/* Items */}
                <Text style={{ color: p.muted, fontSize: 13, marginBottom: 8 }}>
                  {(order.items || []).map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                </Text>

                {/* Total + Actions */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: p.text, fontSize: 18, fontWeight: "900" }}>{fm(order.total)}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {isPending ? (
                      <>
                        <TouchableOpacity style={s.acceptBtn} onPress={() => handleAccept(order.id)}>
                          <Text style={s.acceptBtnText}>✅ ACCEPT & PRINT</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(order.id)}>
                          <Text style={s.cancelBtnText}>✕</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity style={s.payBtn} onPress={() => openPayment(order)}>
                          <Text style={s.payBtnText}>💰 TAKE PAYMENT</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(order.id)}>
                          <Text style={s.cancelBtnText}>✕</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ===== STANDALONE PAYMENT MODAL ===== */}
      <Modal visible={Boolean(payModalOrder)} transparent animationType="fade" onRequestClose={() => setPayModalOrder(null)}>
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: p.surface }]}>
            <Text style={[s.modalTitle, { color: p.text }]}>💰 Takeaway Payment</Text>
            <Text style={[s.modalOrder, { color: p.accent }]}>
              Order #{payModalOrder ? String(payModalOrder.id).padStart(4, "0") : ""}
            </Text>
            <Text style={[s.modalTotal, { color: p.text }]}>Total: {fm(orderTotal)}</Text>

            {/* Payment Method */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              {["cash", "card", "split"].map((m) => (
                <TouchableOpacity key={m}
                  style={[s.methodBtn, paymentMethod === m && { backgroundColor: p.accent, borderColor: p.accent }, { borderColor: p.border }]}
                  onPress={() => setPaymentMethod(m)}
                >
                  <Text style={{ color: paymentMethod === m ? "#fff" : p.muted, fontWeight: "bold", fontSize: 14 }}>
                    {m === "cash" ? "💵 Cash" : m === "card" ? "💳 Card" : "🔀 Split"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {paymentMethod === "cash" ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: p.muted, fontSize: 13, marginBottom: 6 }}>Amount Received</Text>
                <TextInput style={[s.input, { borderColor: p.border, backgroundColor: p.input, color: p.text }]} value={amountTendered} onChangeText={setAmountTendered} keyboardType="decimal-pad" />
                <Text style={{ color: p.text, fontSize: 16, fontWeight: "bold", marginTop: 8, textAlign: "center" }}>
                  Change: {fm(changeDue)}
                </Text>
              </View>
            ) : null}

            {paymentMethod === "split" ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: p.muted, fontSize: 13, marginBottom: 6 }}>Cash Part</Text>
                <TextInput style={[s.input, { borderColor: p.border, backgroundColor: p.input, color: p.text }]} value={splitCash} onChangeText={setSplitCash} keyboardType="decimal-pad" />
                <Text style={{ color: p.text, fontSize: 14, marginTop: 8, textAlign: "center" }}>
                  Card Part: {fm(splitCard)}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setPayModalOrder(null)}>
                <Text style={{ color: p.muted, fontWeight: "bold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, { backgroundColor: p.accent, opacity: canConfirm ? 1 : 0.5 }]}
                onPress={confirmPayment}
                disabled={!canConfirm || processing}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>{processing ? "Processing..." : "✅ COMPLETE & PRINT"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: "bold" },
  badge: { backgroundColor: "#FEF3C7", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  badgeText: { color: "#92400E", fontSize: 13, fontWeight: "bold" },
  list: { flex: 1 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyText: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  emptySub: { fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  orderNum: { fontSize: 16, fontWeight: "900" },
  acceptBtn: { backgroundColor: "#16A34A", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  acceptBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  payBtn: { backgroundColor: "#0EA5E9", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  payBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  cancelBtn: { backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  cancelBtnText: { color: "#DC2626", fontWeight: "bold", fontSize: 14 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
  modal: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  modalOrder: { fontSize: 16, fontWeight: "bold", marginBottom: 12 },
  modalTotal: { fontSize: 26, fontWeight: "900", marginBottom: 20, textAlign: "center" },
  methodBtn: { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  input: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, textAlign: "center", fontWeight: "bold" },
  modalCancelBtn: { flex: 1, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  modalConfirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
});