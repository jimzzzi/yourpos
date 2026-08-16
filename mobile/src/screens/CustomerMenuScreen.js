import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert, Modal } from "react-native";
import { api } from "../api/client";

export default function CustomerMenuScreen({ tableId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [store, setStore] = useState(null);
  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadMenu();
  }, [tableId]);

  const loadMenu = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/qr/menu?t=${tableId}`);
      setStore(res.data?.store || null);
      setTable(res.data?.table || null);
      setCategories(res.data?.categories || []);
      setProducts(res.data?.products || []);
    } catch (e) {
      console.error("QR Menu API Error:", e);
      setError(
        e.response?.data?.error || 
        e.message || 
        "Cannot connect to server. Make sure you're on the same WiFi network as the POS."
      );
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    const variant = product.variants[0];
    setCart((prev) => {
      const existing = prev.find((c) => c.variant_id === variant.id);
      if (existing) {
        return prev.map((c) => (c.variant_id === variant.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, {
        variant_id: variant.id,
        product_id: product.id,
        name: variant.name === "Default" ? product.name : `${product.name} (${variant.name})`,
        price: variant.price,
        quantity: 1,
        image_url: product.image_url,
        is_time_based: product.is_time_based,
        time_unit_minutes: product.time_unit_minutes,
      }];
    });
  };

  const updateQty = (variantId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => (c.variant_id === variantId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const removeItem = (variantId) => setCart((prev) => prev.filter((c) => c.variant_id !== variantId));

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const filtered = selectedCat == null ? products : products.filter((p) => p.category_id === selectedCat);

  const placeOrder = async () => {
    if (cart.length === 0) return;
    try {
      setPlacing(true);
      await api.post("/qr/order", {
        table_id: tableId,
        items: cart.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity })),
      });
      setCart([]);
      setShowCart(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      Alert.alert("Error", e.response?.data?.error || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={{ marginTop: 16, color: "#64748B", fontSize: 15 }}>Loading menu...</Text>
      </View>
    );
  }

  if (error || !store || !table) {
    return (
      <View style={s.center}>
        <Text style={{ fontSize: 64 }}>📡</Text>
        <Text style={{ marginTop: 16, color: "#DC2626", fontSize: 17, fontWeight: "700", textAlign: "center", paddingHorizontal: 20 }}>
          {error || "Menu not available"}
        </Text>
        <Text style={{ marginTop: 12, color: "#64748B", fontSize: 14, textAlign: "center", paddingHorizontal: 30 }}>
          Please check your WiFi connection and try again.
        </Text>
        <TouchableOpacity style={s.retryBtn} onPress={loadMenu}>
          <Text style={s.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sym = store?.currency || "$";
  const fm = (n) => sym + Number(n || 0).toFixed(2);

  return (
    <View style={s.page}>
      <View style={s.phone}>
        {/* HEADER */}
        <View style={s.header}>
          <Text style={s.headerEmoji}>🍽️</Text>
          <Text style={s.storeName} numberOfLines={1}>{store.name}</Text>
          <View style={s.tablePill}>
            <Text style={s.tablePillText}>🪑 {table.name}</Text>
          </View>
        </View>

        {/* CATEGORIES */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catBar} contentContainerStyle={s.catBarInner}>
          <TouchableOpacity style={[s.catChip, selectedCat == null && s.catChipActive]} onPress={() => setSelectedCat(null)}>
            <Text style={[s.catChipText, selectedCat == null && s.catChipTextActive]}>✨ All</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} style={[s.catChip, selectedCat === c.id && s.catChipActive]} onPress={() => setSelectedCat(c.id)}>
              <Text style={[s.catChipText, selectedCat === c.id && s.catChipTextActive]} numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* PRODUCTS */}
        <ScrollView style={s.list} contentContainerStyle={s.listInner} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={s.empty}><Text style={{ fontSize: 48 }}>🍽️</Text><Text style={s.emptyText}>No items here yet</Text></View>
          ) : (
            filtered.map((p) => {
              const price = p.variants[0]?.price || 0;
              return (
                <View key={p.id} style={s.card}>
                  <View style={s.cardImageWrap}>
                    {p.image_url ? (
                      <Image source={{ uri: p.image_url }} style={s.cardImage} resizeMode="cover" />
                    ) : (
                      <View style={[s.cardImage, s.cardImageEmpty]}><Text style={{ fontSize: 40 }}>🍽️</Text></View>
                    )}
                    {p.is_time_based ? (
                      <View style={s.timeBadge}><Text style={s.timeBadgeText}>⏱ per {p.time_unit_minutes} min</Text></View>
                    ) : null}
                  </View>
                  <View style={s.cardBody}>
                    <Text style={s.cardName} numberOfLines={1}>{p.name}</Text>
                    {p.description ? <Text style={s.cardDesc} numberOfLines={2}>{p.description}</Text> : null}
                    <View style={s.cardFooter}>
                      <Text style={s.cardPrice}>{fm(price)}</Text>
                      <TouchableOpacity style={s.addBtn} onPress={() => addToCart(p)} activeOpacity={0.8}>
                        <Text style={s.addBtnText}>+ Add</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 90 }} />
        </ScrollView>

        {/* FLOATING CART BAR */}
        {cartCount > 0 ? (
          <TouchableOpacity style={s.cartBar} onPress={() => setShowCart(true)} activeOpacity={0.9}>
            <View style={s.cartBarLeft}>
              <Text style={s.cartBarCount}>{cartCount}</Text>
              <View>
                <Text style={s.cartBarLabel}>{cartCount === 1 ? "item" : "items"}</Text>
                <Text style={s.cartBarTotal}>{fm(cartTotal)}</Text>
              </View>
            </View>
            <Text style={s.cartBarCta}>View Cart →</Text>
          </TouchableOpacity>
        ) : null}

        {/* CART MODAL */}
        <Modal visible={showCart} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Your Order </Text>
                <TouchableOpacity onPress={() => setShowCart(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 380 }}>
                {cart.map((item) => (
                  <View key={item.variant_id} style={s.cartItem}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={s.cartItemImage} resizeMode="cover" />
                    ) : (
                      <View style={[s.cartItemImage, s.cardImageEmpty]}><Text style={{ fontSize: 22 }}>🍽️</Text></View>
                    )}
                    <View style={s.cartItemInfo}>
                      <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.cartItemPrice}>{fm(item.price * item.quantity)}</Text>
                      <View style={s.qtyRow}>
                        <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.variant_id, -1)}><Text style={s.qtyBtnText}>−</Text></TouchableOpacity>
                        <Text style={s.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.variant_id, 1)}><Text style={s.qtyBtnText}>+</Text></TouchableOpacity>
                        <TouchableOpacity style={s.removeBtn} onPress={() => removeItem(item.variant_id)}>
                          <Text style={s.removeText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={s.totalValue}>{fm(cartTotal)}</Text>
              </View>
              <TouchableOpacity style={s.placeBtn} onPress={placeOrder} disabled={placing} activeOpacity={0.85}>
                <Text style={s.placeBtnText}>{placing ? "Placing..." : "Place Order 🚀"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* SUCCESS */}
        <Modal visible={success} transparent>
          <View style={s.successOverlay}>
            <View style={s.successCard}>
              <Text style={s.successIcon}>✅</Text>
              <Text style={s.successTitle}>Order Placed!</Text>
              <Text style={s.successMsg}>We'll bring your order to {table.name} shortly.</Text>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0F172A", alignItems: "center" },
  phone: { flex: 1, width: "100%", maxWidth: 480, backgroundColor: "#F8FAFC", position: "relative", overflow: "hidden" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC" },
  retryBtn: { marginTop: 20, backgroundColor: "#F97316", borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  retryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  header: { backgroundColor: "#0F172A", paddingTop: 48, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerEmoji: { fontSize: 30, marginBottom: 6 },
  storeName: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: 0.3 },
  tablePill: { alignSelf: "flex-start", marginTop: 12, backgroundColor: "rgba(123,216,138,0.15)", borderWidth: 1, borderColor: "rgba(123,216,138,0.4)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  tablePillText: { color: "#7BD88A", fontSize: 13, fontWeight: "700" },

  catBar: { backgroundColor: "#F8FAFC", maxHeight: 64, borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
  catBarInner: { paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" },
  catChip: { borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8 },
  catChipActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  catChipText: { color: "#64748B", fontWeight: "600", fontSize: 13 },
  catChipTextActive: { color: "#fff", fontWeight: "700" },

  list: { flex: 1 },
  listInner: { padding: 16 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#94A3B8", fontSize: 15, marginTop: 8 },

  card: { backgroundColor: "#fff", borderRadius: 20, marginBottom: 16, overflow: "hidden", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardImageWrap: { position: "relative" },
  cardImage: { width: "100%", height: 170, backgroundColor: "#EEF2F7" },
  cardImageEmpty: { justifyContent: "center", alignItems: "center" },
  timeBadge: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(15,23,42,0.85)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  timeBadgeText: { color: "#FDE68A", fontSize: 11, fontWeight: "700" },
  cardBody: { padding: 14 },
  cardName: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  cardDesc: { fontSize: 13, color: "#94A3B8", marginTop: 3, lineHeight: 18 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  cardPrice: { fontSize: 18, fontWeight: "800", color: "#F97316" },
  addBtn: { backgroundColor: "#0F172A", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  cartBar: { position: "absolute", left: 16, right: 16, bottom: 16, backgroundColor: "#F97316", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#F97316", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  cartBarLeft: { flexDirection: "row", alignItems: "center" },
  cartBarCount: { backgroundColor: "#fff", borderRadius: 10, width: 34, height: 34, justifyContent: "center", alignItems: "center", fontSize: 16, fontWeight: "800", color: "#F97316", marginRight: 12 },
  cartBarLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },
  cartBarTotal: { color: "#fff", fontSize: 17, fontWeight: "800" },
  cartBarCta: { color: "#fff", fontSize: 15, fontWeight: "800" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "flex-end", alignItems: "center" },
  modalCard: { width: "100%", maxWidth: 480, backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  modalClose: { fontSize: 20, color: "#94A3B8", fontWeight: "700" },
  cartItem: { flexDirection: "row", padding: 10, backgroundColor: "#F8FAFC", borderRadius: 14, marginBottom: 10 },
  cartItemImage: { width: 62, height: 62, borderRadius: 12, backgroundColor: "#EEF2F7", marginRight: 12 },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  cartItemPrice: { fontSize: 14, fontWeight: "700", color: "#F97316", marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  qtyBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0", justifyContent: "center", alignItems: "center" },
  qtyBtnText: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  qtyText: { fontSize: 15, fontWeight: "800", marginHorizontal: 14, color: "#0F172A" },
  removeBtn: { marginLeft: "auto", padding: 4 },
  removeText: { color: "#DC2626", fontSize: 12, fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 14 },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  totalValue: { fontSize: 22, fontWeight: "800", color: "#F97316" },
  placeBtn: { backgroundColor: "#16A34A", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  placeBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  successOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.85)", justifyContent: "center", alignItems: "center", padding: 30 },
  successCard: { backgroundColor: "#fff", borderRadius: 24, padding: 32, alignItems: "center", maxWidth: 340 },
  successIcon: { fontSize: 60, marginBottom: 14 },
  successTitle: { fontSize: 22, fontWeight: "800", color: "#0F172A", marginBottom: 6 },
  successMsg: { fontSize: 15, color: "#64748B", textAlign: "center", lineHeight: 22 },
});