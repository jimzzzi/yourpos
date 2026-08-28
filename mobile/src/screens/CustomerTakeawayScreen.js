import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, TextInput, Modal } from "react-native";
import { api } from "../api/client";

const ACCENT = "#E8590C";

export default function CustomerTakeawayScreen({ storeId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [itemModal, setItemModal] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedMods, setSelectedMods] = useState([]);
  const [qty, setQty] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(null);
  const [orderStatus, setOrderStatus] = useState("pending");

  const sym = (store && (store.currency_symbol || store.currency)) || "AED";
  const fm = (n) => sym + Number(n || 0).toFixed(2);

  const loadMenu = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/takeaway/menu", { params: { store: storeId } });
      setStore(res.data.store || null);
      setProducts(res.data.products || []);
      setCategories(res.data.categories || []);
      setModifiers(res.data.modifiers || []);
    } catch (e) {
      setError("We couldn't load the menu. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMenu(); }, []);

  // Poll order status after placing
  useEffect(() => {
    if (!orderPlaced || !orderPlaced.order_id) return;
    const t = setInterval(async () => {
      try {
        const r = await api.get("/takeaway/order/" + orderPlaced.order_id + "/status");
        setOrderStatus(r.data.status || "pending");
      } catch (e) {}
    }, 5000);
    return () => clearInterval(t);
  }, [orderPlaced]);

  const filtered = useMemo(() => products.filter((p) => {
    const matchCat = selectedCategory == null || p.category_id === selectedCategory;
    const matchSearch = (p.name || "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, selectedCategory, search]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const taxRate = Number(store?.tax_rate || 0) / 100;
  const vatInclusive = Boolean(store && store.tax_inclusive);
  const cartTax = vatInclusive ? cartSubtotal - cartSubtotal / (1 + taxRate) : cartSubtotal * taxRate;
  const cartTotal = vatInclusive ? cartSubtotal : cartSubtotal + cartTax;

  const openItem = (product) => {
    const variants = product.variants || [];
    if (variants.length === 0) return;
    setSelectedVariant(variants[0]);
    setSelectedMods([]);
    setQty(1);
    setItemModal(product);
  };

  const applicableMods = (product) =>
    (modifiers || []).filter((m) => (m.category_ids || []).length === 0 || (product.category_id != null && (m.category_ids || []).includes(product.category_id)));

  const toggleMod = (m) => {
    setSelectedMods((prev) => (prev.find((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m]));
  };

  const addToCart = () => {
    if (!itemModal || !selectedVariant) return;
    const modsPrice = selectedMods.reduce((s, m) => s + Number(m.price || 0), 0);
    const unitPrice = Number(selectedVariant.price || 0) + modsPrice;
    const modsKey = selectedMods.map((m) => m.id).join("-");
    const lineId = String(selectedVariant.id) + (modsKey ? "_" + modsKey : "");
    const displayName = selectedVariant.name && selectedVariant.name !== "Default" ? itemModal.name + " (" + selectedVariant.name + ")" : itemModal.name;

    setCart((prev) => {
      const existing = prev.find((i) => i.id === lineId);
      if (existing) return prev.map((i) => (i.id === lineId ? { ...i, quantity: i.quantity + qty } : i));
      return [...prev, {
        id: lineId, variant_id: selectedVariant.id, product_id: itemModal.id,
        name: displayName, price: unitPrice, quantity: qty, image_url: itemModal.image_url,
        modifiers: selectedMods.map((m) => ({ modifier_id: m.id, name: m.name, price: Number(m.price || 0) })),
      }];
    });
    setItemModal(null);
  };

  const updateQty = (id, delta) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i)).filter((i) => i.quantity > 0));
  };

  const placeOrder = async () => {
    if (cart.length === 0 || placing) return;
    setPlacing(true);
    try {
      const res = await api.post("/takeaway/order", {
        store_id: storeId,
        customer_name: customerName.trim() || "Guest",
        customer_phone: customerPhone.trim(),
        note: note.trim(),
        items: cart.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
          modifiers: (i.modifiers || []).map((m) => ({ modifier_id: m.modifier_id })),
        })),
      });
      setOrderPlaced(res.data || { order_id: null });
      setOrderStatus("pending");
      setCart([]); setNote(""); setCustomerName(""); setCustomerPhone(""); setCartOpen(false);
    } catch (e) {
      setError("Could not place your order. Please try again or ask our staff.");
    } finally {
      setPlacing(false);
    }
  };

  // ===== SUCCESS SCREEN =====
  if (orderPlaced) {
    return (
      <View style={s.centerWrap}>
        <View style={s.successCard}>
          <View style={s.successIcon}><Text style={{ fontSize: 44 }}>🎉</Text></View>
          <Text style={s.successTitle}>Order Received!</Text>
          <Text style={s.successSub}>
            Order <Text style={{ fontWeight: "bold" }}>#{orderPlaced.order_number || ""}</Text> has been sent to the kitchen.
          </Text>
          <View style={s.successBadge}>
            <Text style={s.successBadgeText}>
              {orderStatus === "pending" ? "🟡 Waiting for confirmation…" : orderStatus === "accepted" ? "👨‍🍳 Preparing your food…" : orderStatus === "completed" ? "✅ Completed — thank you!" : "📋 " + orderStatus}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 18 }}>
            💵 Please pay at the counter when you pick up your order.
          </Text>
          <TouchableOpacity style={s.successBtn} onPress={() => setOrderPlaced(null)}>
            <Text style={s.successBtnText}>Order More</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.centerWrap}>
        <Text style={{ fontSize: 50, marginBottom: 16 }}>🥡</Text>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={s.loadingText}>Loading menu…</Text>
      </View>
    );
  }

  if (error && products.length === 0) {
    return (
      <View style={s.centerWrap}>
        <Text style={{ fontSize: 50, marginBottom: 16 }}>📵</Text>
        <Text style={s.errorTitle}>Connection Issue</Text>
        <Text style={s.errorSub}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={loadMenu}><Text style={s.retryBtnText}>🔄 Try Again</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.app}>
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={s.hero}>
          <Text style={s.heroEmoji}>🥡</Text>
          <Text style={s.heroTitle}>{store ? store.name : "Takeaway"}</Text>
          <Text style={s.heroSub}>Order Now • Pick Up • Pay at Counter ✨</Text>
        </View>

        <View style={s.searchWrap}>
          <TextInput style={s.searchInput} placeholder="🔍 Search dishes…" placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catBar} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <TouchableOpacity style={[s.catChip, selectedCategory == null && s.catChipActive]} onPress={() => setSelectedCategory(null)}>
            <Text style={[s.catChipText, selectedCategory == null && s.catChipTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} style={[s.catChip, selectedCategory === c.id && s.catChipActive]} onPress={() => setSelectedCategory(c.id)}>
              <Text style={[s.catChipText, selectedCategory === c.id && s.catChipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.listWrap}>
          {filtered.length === 0 ? (
            <View style={s.emptyBox}><Text style={{ fontSize: 40, marginBottom: 10 }}>🥡</Text><Text style={s.emptyText}>No dishes found</Text></View>
          ) : (
            filtered.map((p) => {
              const variants = p.variants || [];
              const minPrice = variants.length ? Math.min(...variants.map((v) => Number(v.price || 0))) : 0;
              return (
                <TouchableOpacity key={p.id} style={s.card} onPress={() => openItem(p)}>
                  <View style={s.cardBody}>
                    <View style={s.cardInfo}>
                      <Text style={s.cardName} numberOfLines={2}>{p.name}</Text>
                      <Text style={s.cardDesc} numberOfLines={2}>{p.description || " "}</Text>
                      <Text style={s.cardPrice}>{fm(minPrice)}</Text>
                    </View>
                    <View style={s.cardImageBox}>
                      {p.image_url ? <Image source={{ uri: p.image_url }} style={s.cardImage} resizeMode="cover" /> : <Text style={s.cardEmoji}>🥡</Text>}
                      <View style={s.addDot}><Text style={s.addDotText}>+</Text></View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
        <Text style={s.footer}>Powered by YourPOS ⚡</Text>
      </ScrollView>

      {cartCount > 0 ? (
        <TouchableOpacity style={s.cartBar} onPress={() => setCartOpen(true)}>
          <View style={s.cartBarLeft}>
            <View style={s.cartCountBubble}><Text style={s.cartCountText}>{cartCount}</Text></View>
            <Text style={s.cartBarLabel}>View Cart</Text>
          </View>
          <Text style={s.cartBarTotal}>{fm(cartTotal)}</Text>
        </TouchableOpacity>
      ) : null}

      {/* ITEM MODAL */}
      <Modal visible={Boolean(itemModal)} transparent animationType="slide" onRequestClose={() => setItemModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {itemModal ? (
              <ScrollView>
                <View style={s.modalImageBox}>
                  {itemModal.image_url ? <Image source={{ uri: itemModal.image_url }} style={s.modalImage} resizeMode="cover" /> : <Text style={{ fontSize: 60 }}>🥡</Text>}
                  <TouchableOpacity style={s.modalClose} onPress={() => setItemModal(null)}><Text style={{ color: "#fff", fontWeight: "bold" }}>✕</Text></TouchableOpacity>
                </View>
                <View style={s.modalBody}>
                  <Text style={s.modalTitle}>{itemModal.name}</Text>
                  <Text style={s.modalDesc}>{itemModal.description || ""}</Text>

                  {(itemModal.variants || []).length > 1 ? (
                    <View style={s.modalSection}>
                      <Text style={s.modalSectionTitle}>Choose Option</Text>
                      {itemModal.variants.map((v) => (
                        <TouchableOpacity key={v.id} style={[s.variantRow, selectedVariant && selectedVariant.id === v.id && s.variantRowActive]} onPress={() => setSelectedVariant(v)}>
                          <Text style={[s.variantName, selectedVariant && selectedVariant.id === v.id && s.variantNameActive]}>{v.name}</Text>
                          <Text style={s.variantPrice}>{fm(v.price)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {applicableMods(itemModal).length > 0 ? (
                    <View style={s.modalSection}>
                      <Text style={s.modalSectionTitle}>Add Extras</Text>
                      {applicableMods(itemModal).map((m) => {
                        const active = Boolean(selectedMods.find((x) => x.id === m.id));
                        return (
                          <TouchableOpacity key={m.id} style={s.modRow} onPress={() => toggleMod(m)}>
                            <Text style={s.modName}>{m.name} (+{fm(m.price)})</Text>
                            <View style={[s.modCheck, active && s.modCheckActive]}>
                              {active ? <Text style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>✓</Text> : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

                  <View style={s.modalFooter}>
                    <View style={s.qtyRow}>
                      <TouchableOpacity style={s.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}><Text style={s.qtyBtnText}>−</Text></TouchableOpacity>
                      <Text style={s.qtyNum}>{qty}</Text>
                      <TouchableOpacity style={s.qtyBtn} onPress={() => setQty((q) => q + 1)}><Text style={s.qtyBtnText}>+</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity style={s.addBtn} onPress={addToCart}>
                      <Text style={s.addBtnText}>Add • {fm((Number(selectedVariant ? selectedVariant.price : 0) + selectedMods.reduce((s2, m) => s2 + Number(m.price || 0), 0)) * qty)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* CART MODAL */}
      <Modal visible={cartOpen} transparent animationType="slide" onRequestClose={() => setCartOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.cartCard}>
            <View style={s.cartHeader}>
              <Text style={s.cartTitle}>Your Order 🛒</Text>
              <TouchableOpacity onPress={() => setCartOpen(false)}><Text style={{ fontSize: 20, color: "#64748B" }}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {cart.map((i) => (
                <View key={i.id} style={s.cartItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cartItemName}>{i.name}</Text>
                    {i.modifiers && i.modifiers.length > 0 ? <Text style={s.cartItemMods}>{i.modifiers.map((m) => "+ " + m.name).join(", ")}</Text> : null}
                    <Text style={s.cartItemPrice}>{fm(i.price * i.quantity)}</Text>
                  </View>
                  <View style={s.qtyRowSmall}>
                    <TouchableOpacity style={s.qtyBtnSmall} onPress={() => updateQty(i.id, -1)}><Text style={s.qtyBtnSmallText}>−</Text></TouchableOpacity>
                    <Text style={s.qtyNumSmall}>{i.quantity}</Text>
                    <TouchableOpacity style={s.qtyBtnSmall} onPress={() => updateQty(i.id, 1)}><Text style={s.qtyBtnSmallText}>+</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              <TextInput style={s.noteInput} placeholder="Your name (optional)" placeholderTextColor="#94A3B8" value={customerName} onChangeText={setCustomerName} />
              <TextInput style={s.noteInput} placeholder="Phone number (optional)" placeholderTextColor="#94A3B8" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
              <TextInput style={s.noteInput} placeholder="Any special instructions? (optional)" placeholderTextColor="#94A3B8" value={note} onChangeText={setNote} multiline />
            </ScrollView>
            <View style={s.cartFooter}>
              <View style={s.cartTotalRow}>
                <Text style={s.cartTotalLabel}>Total (incl. VAT)</Text>
                <Text style={s.cartTotalValue}>{fm(cartTotal)}</Text>
              </View>
              <TouchableOpacity style={[s.placeBtn, placing && { opacity: 0.6 }]} onPress={placeOrder} disabled={placing}>
                <Text style={s.placeBtnText}>{placing ? "Sending…" : "🚀 Place Order — Pay at Counter"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: "#FAF7F2" },
  scroll: { flex: 1 },
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FAF7F2", padding: 30 },
  loadingText: { marginTop: 14, color: "#64748B", fontSize: 15 },
  errorTitle: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 8 },
  errorSub: { color: "#64748B", fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  retryBtn: { backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  retryBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  hero: { backgroundColor: ACCENT, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, padding: 22, paddingBottom: 30 },
  heroEmoji: { fontSize: 34, marginBottom: 8 },
  heroTitle: { color: "#fff", fontSize: 30, fontWeight: "bold", marginBottom: 4 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 14 },
  searchWrap: { paddingHorizontal: 16, marginTop: -18 },
  searchInput: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: "#0F172A", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  catBar: { marginTop: 16, marginBottom: 6, flexGrow: 0 },
  catChip: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, marginRight: 8, backgroundColor: "#fff" },
  catChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  catChipText: { color: "#475569", fontWeight: "600", fontSize: 14 },
  catChipTextActive: { color: "#fff" },
  listWrap: { paddingHorizontal: 16, marginTop: 8 },
  emptyBox: { alignItems: "center", paddingVertical: 50 },
  emptyText: { color: "#94A3B8", fontSize: 15 },
  card: { backgroundColor: "#fff", borderRadius: 18, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, overflow: "hidden" },
  cardBody: { flexDirection: "row", padding: 12 },
  cardInfo: { flex: 1, paddingRight: 12, justifyContent: "center" },
  cardName: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 4 },
  cardDesc: { fontSize: 12, color: "#94A3B8", marginBottom: 8, lineHeight: 17 },
  cardPrice: { fontSize: 16, fontWeight: "bold", color: ACCENT },
  cardImageBox: { width: 96, height: 96, borderRadius: 14, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" },
  cardImage: { width: 96, height: 96 },
  cardEmoji: { fontSize: 40 },
  addDot: { position: "absolute", bottom: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: ACCENT, justifyContent: "center", alignItems: "center" },
  addDotText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  footer: { textAlign: "center", color: "#CBD5E1", fontSize: 12, marginTop: 20, marginBottom: 10 },
  cartBar: { position: "absolute", left: 16, right: 16, bottom: 16, backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  cartBarLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  cartCountBubble: { backgroundColor: "#fff", borderRadius: 12, minWidth: 24, height: 24, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
  cartCountText: { color: ACCENT, fontWeight: "bold", fontSize: 13 },
  cartBarLabel: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  cartBarTotal: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
  modalImageBox: { height: 200, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center", position: "relative" },
  modalImage: { width: "100%", height: 200 },
  modalClose: { position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalBody: { padding: 20 },
  modalTitle: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 6 },
  modalDesc: { fontSize: 14, color: "#94A3B8", marginBottom: 14, lineHeight: 20 },
  modalSection: { marginBottom: 16 },
  modalSectionTitle: { fontSize: 15, fontWeight: "bold", color: "#0F172A", marginBottom: 10 },
  variantRow: { flexDirection: "row", justifyContent: "space-between", borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  variantRowActive: { borderColor: ACCENT, backgroundColor: "#FFF4EC" },
  variantName: { fontSize: 14, fontWeight: "600", color: "#334155" },
  variantNameActive: { color: "#D9480F" },
  variantPrice: { fontSize: 14, fontWeight: "bold", color: "#0F172A" },
  modRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  modName: { fontSize: 14, color: "#334155" },
  modCheck: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: "#CBD5E1", justifyContent: "center", alignItems: "center" },
  modCheckActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  modalFooter: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center" },
  qtyBtnText: { fontSize: 16, fontWeight: "bold", color: ACCENT },
  qtyNum: { fontSize: 16, fontWeight: "bold", color: "#0F172A", minWidth: 20, textAlign: "center" },
  addBtn: { flex: 1, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  addBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  cartCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", padding: 20 },
  cartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  cartTitle: { fontSize: 20, fontWeight: "bold", color: "#0F172A" },
  cartItem: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  cartItemName: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  cartItemMods: { fontSize: 12, color: ACCENT, marginTop: 2 },
  cartItemPrice: { fontSize: 14, fontWeight: "bold", color: "#0F172A", marginTop: 4 },
  qtyRowSmall: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtnSmall: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center" },
  qtyBtnSmallText: { fontSize: 14, fontWeight: "bold", color: ACCENT },
  qtyNumSmall: { fontSize: 14, fontWeight: "bold", color: "#0F172A", minWidth: 18, textAlign: "center" },
  noteInput: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: "#0F172A", marginTop: 10, minHeight: 44 },
  cartFooter: { borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: 14, marginTop: 10 },
  cartTotalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  cartTotalLabel: { fontSize: 16, fontWeight: "bold", color: "#0F172A" },
  cartTotalValue: { fontSize: 20, fontWeight: "bold", color: ACCENT },
  placeBtn: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  placeBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  successCard: { backgroundColor: "#fff", borderRadius: 24, padding: 30, alignItems: "center", width: "100%", maxWidth: 380, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, elevation: 5 },
  successIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#DCFCE7", justifyContent: "center", alignItems: "center", marginBottom: 18 },
  successTitle: { fontSize: 24, fontWeight: "bold", color: "#0F172A", marginBottom: 8 },
  successSub: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20, marginBottom: 18 },
  successBadge: { backgroundColor: "#FEF3C7", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 14 },
  successBadgeText: { color: "#B45309", fontWeight: "bold", fontSize: 13 },
  successBtn: { backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  successBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
});