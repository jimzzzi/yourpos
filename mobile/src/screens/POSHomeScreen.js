import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, ActivityIndicator, Image } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { getPalette } from "../theme";
import { inventoryApi } from "../api/inventory";
import { backofficeApi } from "../api/backoffice";
import { api } from "../api/client";
import { createOrder } from "../services/orderService";
import { syncOfflineOrders } from "../services/syncService";
import { printReceipt, printKitchenTicket, routeItemsForKitchen } from "../services/printerService";
import { nextReceiptNumber } from "../services/receiptCounter";
import VariantPickerModal from "../components/VariantPickerModal";
import ModifierModal from "../components/ModifierModal";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import HardwareScannerInput from "../components/HardwareScannerInput";
import { useRights } from "../auth/RightsContext";

function makeStyles(p, cols) {
  const cardWidth = Math.max(12, 100 / cols - 2) + "%";
  return {
    container: { flex: 1, flexDirection: "row", backgroundColor: p.bg },
    productsPanel: { flex: 2.5, borderRightWidth: 1, borderColor: p.border, backgroundColor: p.bg },
    cartPanel: { flex: 1, backgroundColor: p.surface },
    searchContainer: { flexDirection: "row", padding: 15, gap: 12, borderBottomWidth: 1, borderBottomColor: p.border, backgroundColor: p.surface },
    searchInput: { flex: 1, backgroundColor: p.input, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: p.text, borderWidth: 1, borderColor: p.border },
    scanButton: { backgroundColor: "#0F172A", borderRadius: 8, paddingHorizontal: 20, justifyContent: "center", borderWidth: 1, borderColor: p.border },
    scanButtonText: { color: "#fff", fontWeight: "bold" },
    tablesButton: { paddingHorizontal: 28, paddingVertical: 12 },
    catBar: { backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.border, paddingVertical: 10, paddingHorizontal: 10, flexGrow: 0, flexShrink: 0, height: 52 },
    catChip: { borderWidth: 1, borderColor: p.border, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, backgroundColor: p.surface2 },
    catChipActive: { backgroundColor: p.accent, borderColor: p.accent },
    catChipText: { color: p.muted, fontWeight: "600" },
    catChipTextActive: { color: "#fff" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    gridContainer: { padding: 10, flexDirection: "row", flexWrap: "wrap" },
    productCard: { width: cardWidth, margin: "0.8%", backgroundColor: p.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: p.border },
    outOfStockCard: { opacity: 0.6 },
    productImageBox: { width: "100%", height: 110, borderRadius: 10, overflow: "hidden", marginBottom: 8, backgroundColor: p.surface2, justifyContent: "center", alignItems: "center" },
    productIconContainer: { width: "100%", height: 110, justifyContent: "center", alignItems: "center", marginBottom: 8 },
    productIcon: { fontSize: 40 },
    productImage: { width: "100%", height: 110 },
    productName: { fontSize: 14, fontWeight: "600", color: p.text, textAlign: "center", height: 34 },
    productDesc: { fontSize: 11, color: p.muted, textAlign: "center", height: 16 },
    productPrice: { fontSize: 15, fontWeight: "bold", color: p.accent, textAlign: "center", height: 20, marginTop: 2 },
    outOfStockText: { fontSize: 11, color: p.dangerText, textAlign: "center", fontWeight: "bold", height: 14 },
    listContainer: { padding: 15 },
    listCard: { flexDirection: "row", alignItems: "center", backgroundColor: p.surface, borderRadius: 10, borderWidth: 1, borderColor: p.border, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 10 },
    listIcon: { width: 52, height: 52, borderRadius: 10, overflow: "hidden", backgroundColor: p.surface2, justifyContent: "center", alignItems: "center", marginRight: 12 },
    listImage: { width: 52, height: 52 },
    listName: { fontSize: 16, fontWeight: "600", color: p.text },
    listMeta: { fontSize: 13, color: p.muted, marginTop: 2 },
    listPrice: { fontSize: 16, fontWeight: "bold", color: p.accent },
    cartHeader: { padding: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: p.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: p.surface, gap: 8, flexWrap: "wrap" },
    cartHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    cartTitle: { fontSize: 17, fontWeight: "bold", color: p.text },
    cartHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    cashBtnRow: { flexDirection: "row", gap: 6, alignItems: "center" },
    cashInButton: { backgroundColor: p.successBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#86EFAC" },
    cashOutButton: { backgroundColor: p.dangerBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#FCA5A5" },
    cashInText: { color: p.successText, fontWeight: "bold", fontSize: 13 },
    cashOutText: { color: p.dangerText, fontWeight: "bold", fontSize: 13 },
    voidAllText: { color: p.dangerText, fontWeight: "bold", fontSize: 14, paddingHorizontal: 8 },
    cartList: { flex: 1, padding: 15 },
    emptyCart: { alignItems: "center", marginTop: 40 },
    emptyCartIcon: { fontSize: 48, marginBottom: 10, opacity: 0.3 },
    emptyCartText: { color: p.muted, fontSize: 16 },
    cartItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: p.border, gap: 8 },
    cartItemLeft: { flex: 1, minWidth: 0 },
    cartItemName: { fontSize: 16, fontWeight: "700", color: p.text, marginBottom: 3 },
    cartItemMods: { fontSize: 13, color: p.accent, marginTop: 3, fontWeight: "500" },
    cartItemPrice: { color: p.muted, marginTop: 4, fontSize: 14, fontWeight: "600" },
    quantityControls: { flexDirection: "row", alignItems: "center", gap: 8 },
    qtyBtn: { backgroundColor: p.surface2, width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: p.border },
    qtyBtnText: { fontSize: 20, fontWeight: "bold", color: p.text },
    qtyText: { fontSize: 18, fontWeight: "bold", minWidth: 26, textAlign: "center", color: p.text },
    voidButton: { marginLeft: 4, width: 36, height: 36, borderRadius: 18, backgroundColor: p.dangerBg, justifyContent: "center", alignItems: "center" },
    voidButtonText: { color: p.dangerText, fontWeight: "bold", fontSize: 16 },
    cartFooter: { padding: 15, borderTopWidth: 1, borderTopColor: p.border, backgroundColor: p.surface },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    totalsLabel: { color: p.muted, fontSize: 15 },
    totalsValue: { color: p.text, fontSize: 15, fontWeight: "500" },
    discountValue: { color: p.dangerText, fontWeight: "bold" },
    totalRow: { marginTop: 10, marginBottom: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: p.border },
    bold: { fontWeight: "bold", fontSize: 22, color: p.text },
    payButton: { backgroundColor: p.accent, padding: 13, borderRadius: 10, alignItems: "center", marginBottom: 8 },
    payButtonText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
    paymentOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
    paymentCard: { width: "100%", maxWidth: 420, backgroundColor: p.surface, borderRadius: 16, padding: 24 },
    paymentTitle: { fontSize: 24, fontWeight: "bold", color: p.text, marginBottom: 10 },
    paymentTotal: { fontSize: 28, fontWeight: "bold", color: p.accent, marginBottom: 24 },
    paymentMethodRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
    paymentMethodButton: { flex: 1, borderWidth: 2, borderColor: p.border, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    paymentMethodActive: { backgroundColor: p.accent, borderColor: p.accent },
    paymentMethodText: { color: p.muted, fontWeight: "bold", fontSize: 15 },
    paymentMethodTextActive: { color: "#fff" },
    paymentLabel: { fontSize: 14, fontWeight: "600", color: p.muted, marginBottom: 8 },
    paymentInput: { borderWidth: 2, borderColor: p.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, backgroundColor: p.input, marginBottom: 12, textAlign: "center", fontWeight: "bold", color: p.text },
    paymentChange: { fontSize: 18, fontWeight: "bold", color: p.text, marginBottom: 24, textAlign: "center" },
    paymentButtonRow: { flexDirection: "row", gap: 12 },
    paymentCancelButton: { flex: 1, borderWidth: 2, borderColor: p.border, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
    paymentCancelText: { color: p.muted, fontWeight: "bold", fontSize: 16 },
    paymentConfirmButton: { flex: 1, backgroundColor: p.accent, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
    paymentConfirmDisabled: { opacity: 0.5 },
    paymentConfirmText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
    noteInput: { borderWidth: 2, borderColor: p.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: p.input, marginBottom: 20, minHeight: 70, textAlignVertical: "top", color: p.text },
    voidBadge: { position: "absolute", top: 4, right: 4, backgroundColor: "#DC2626", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    voidBadgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
    timerBadge: { position: "absolute", bottom: 4, right: 4, backgroundColor: "#0F172A", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    timerBadgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
    // ========== PRE-PRINT BUTTON ON BUSY TABLES ==========
    preprintBtn: { position: "absolute", top: 6, left: 6, backgroundColor: "#0EA5E9", borderRadius: 8, width: 34, height: 34, justifyContent: "center", alignItems: "center", zIndex: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
    preprintBtnText: { fontSize: 16 },
    // ========== PRE-PRINT MODAL STYLES ==========
    preprintItemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: p.border },
    preprintItemName: { flex: 1, fontSize: 14, fontWeight: "600", color: p.text },
    preprintItemQty: { fontSize: 14, color: p.muted, marginRight: 10 },
    preprintItemPrice: { fontSize: 14, fontWeight: "bold", color: p.text },
    qrPanel: { position: "absolute", bottom: 20, right: 20, width: 360, maxHeight: 400, backgroundColor: p.surface, borderRadius: 16, borderWidth: 2, borderColor: "#DC2626", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, overflow: "hidden" },
    qrPanelHeader: { backgroundColor: "#DC2626", padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    qrPanelTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
    qrPanelBadge: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
    qrPanelBadgeText: { color: "#DC2626", fontSize: 13, fontWeight: "bold" },
    qrPanelList: { maxHeight: 300 },
    qrOrderItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: p.border },
    qrOrderHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    qrOrderTable: { fontSize: 15, fontWeight: "bold", color: p.text },
    qrOrderTime: { fontSize: 12, color: p.muted },
    qrOrderItems: { fontSize: 13, color: p.muted, marginBottom: 10 },
    qrOrderActions: { flexDirection: "row", gap: 8 },
    qrAcceptBtn: { flex: 1, backgroundColor: "#16A34A", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
    qrRejectBtn: { flex: 1, backgroundColor: p.surface2, borderRadius: 8, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: p.border },
    qrAcceptText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
    qrRejectText: { color: p.text, fontWeight: "bold", fontSize: 13 },
  };
}

export default function POSHomeScreen() {
  const { user, store } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const { can } = useRights();
  const p = getPalette(settings.darkMode);
  const cols = Math.min(8, Math.max(1, Number(settings.gridColumns || 3)));
  const styles = makeStyles(p, cols);

  const dec = Number.isInteger(Number(settings.decimals)) ? Number(settings.decimals) : 2;
  const sym = settings.currencySymbol || "$";
  const fm = (n) => sym + Number(n || 0).toFixed(dec);

  const [products, setProducts] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [variantPickerProduct, setVariantPickerProduct] = useState(null);
  const [modifierPick, setModifierPick] = useState(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [diningOption, setDiningOption] = useState("dine_in");
  const [processing, setProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);

  const [cashModal, setCashModal] = useState(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [savingCash, setSavingCash] = useState(false);

  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");

  const [tablesView, setTablesView] = useState(false);
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [originalCartForTable, setOriginalCartForTable] = useState([]);
  const [voidReasonModal, setVoidReasonModal] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [qrOrders, setQrOrders] = useState([]);
  const qrCountRef = useRef(0);

  // ========== PRE-PRINT STATE ==========
  const [preprintTable, setPreprintTable] = useState(null);
  const [preprintItems, setPreprintItems] = useState([]);
  const [preprintTotals, setPreprintTotals] = useState(null);
  const [preprintIsCopy, setPreprintIsCopy] = useState(true);
  const [preprintLoading, setPreprintLoading] = useState(false);

  const playOrderSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(660, audioCtx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 1.0);
      console.log("🔔 Order sound played!");
    } catch (e) {
      console.error("Sound error:", e);
    }
  };

  const taxRate = Number(store?.tax_rate || 0) / 100;
  const vatInclusive = Boolean(store && store.tax_inclusive);

  const orderStartTime = activeTable && activeTable.open_order && activeTable.open_order.created_at
    ? new Date(activeTable.open_order.created_at).getTime()
    : null;

  const applyTimeCharges = (items, startTime, nowMs) => {
    return (items || []).map((item) => {
      if (!item.is_time_based || !item.time_unit_minutes) return item;
      const st = startTime || item.time_start;
      if (!st) return item;
      const elapsedMinutes = Math.floor((nowMs - st) / 1000 / 60);
      const units = Math.ceil(elapsedMinutes / item.time_unit_minutes);
      const timeCharge = units * Number(item.price || 0);
      return {
        ...item,
        original_price: item.price,
        price: timeCharge / item.quantity,
        time_elapsed_minutes: elapsedMinutes,
        time_units: units,
      };
    });
  };

  const displayCart = useMemo(
    () => applyTimeCharges(cart, orderStartTime, nowTick),
    [cart, orderStartTime, nowTick]
  );

  const { subtotal, discount, tax, total } = useMemo(() => {
    const raw = displayCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const dv = Number(discountValue || 0);
    const discountAmount = Math.min(raw, discountType === "percent" ? (raw * dv) / 100 : dv);
    const afterDiscount = raw - discountAmount;
    if (vatInclusive) {
      const totalV = afterDiscount;
      const taxV = totalV - totalV / (1 + taxRate);
      return { subtotal: totalV - taxV, discount: discountAmount, tax: taxV, total: totalV };
    }
    const taxV = afterDiscount * taxRate;
    return { subtotal: afterDiscount, discount: discountAmount, tax: taxV, total: afterDiscount + taxV };
  }, [displayCart, taxRate, vatInclusive, discountType, discountValue]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingProducts(true);
        const [productData, modifierData, categoryData] = await Promise.all([
          inventoryApi.getProducts(),
          backofficeApi.getModifiers().catch(() => []),
          inventoryApi.getCategories().catch(() => []),
        ]);
        setCategories(categoryData || []);
        const mapped = productData.map((product) => {
          const variants = product.variants || [];
          const totalStock = variants.reduce((s, v) => s + Number(v.stock_quantity || 0), 0);
          const minPrice = variants.length ? Math.min(...variants.map((v) => Number(v.price || 0))) : 0;
          return {
            id: String(product.id),
            product_id: product.id,
            name: product.name,
            category_id: product.category_id,
            image_url: product.image_url,
            description: product.description,
            track_stock: Boolean(product.track_stock),
            is_time_based: Boolean(product.is_time_based),
            time_unit_minutes: product.time_unit_minutes,
            variants,
            stock_quantity: totalStock,
            price: minPrice,
          };
        });
        setProducts(mapped);
        setModifiers(modifierData || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingProducts(false);
      }
    };
    loadData();
  }, []);

  const loadTables = async () => {
    try {
      setTables(await backofficeApi.getTables());
    } catch (error) {}
  };

  useEffect(() => {
    if (settings.tablesEnabled) loadTables();
  }, [settings.tablesEnabled]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const pollQrOrders = async () => {
      if (!settings.qrOrderingEnabled) return;
      try {
        const res = await api.get("/qr/pending");
        const pending = Array.isArray(res.data) ? res.data : [];
        console.log("🔍 QR Poll result:", pending.length, "pending orders");
        if (pending.length > qrCountRef.current && qrCountRef.current >= 0) {
          playOrderSound();
        }
        qrCountRef.current = pending.length;
        setQrOrders(pending);
      } catch (e) {
        console.error("🔍 QR Poll error:", e.message);
      }
    };
    pollQrOrders();
    const interval = setInterval(pollQrOrders, 5000);
    return () => clearInterval(interval);
  }, [settings.qrOrderingEnabled]);

  const filteredProducts = products.filter(
    (pp) =>
      pp.name.toLowerCase().includes(search.toLowerCase()) &&
      (selectedCategory == null || pp.category_id === selectedCategory)
  );

  const applicableFor = (product) =>
    (modifiers || []).filter(
      (m) =>
        (m.category_ids || []).length === 0 ||
        (product.category_id != null && (m.category_ids || []).includes(product.category_id))
    );

  const addToCart = (product, variant, mods) => {
    const modsList = mods || [];
    const modsKey = modsList.map((m) => m.id).join("-");
    const lineId = String(variant.id) + (modsKey ? "_" + modsKey : "");
    const unitPrice = Number(variant.price || 0) + modsList.reduce((s, m) => s + Number(m.price || 0), 0);

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === lineId);
      if (existing) {
        return prevCart.map((item) => (item.id === lineId ? { ...item, quantity: item.quantity + 1 } : item));
      }
      const displayName =
        variant.name && variant.name !== "Default" ? product.name + " (" + variant.name + ")" : product.name;
      return [
        ...prevCart,
        {
          id: lineId,
          variant_id: variant.id,
          product_id: product.product_id || product.id,
          category_id: product.category_id,
          name: displayName,
          description: product.description,
          price: unitPrice,
          quantity: 1,
          modifiers: modsList.map((m) => ({ modifier_id: m.id, name: m.name, price: Number(m.price || 0) })),
          is_time_based: Boolean(product.is_time_based),
          time_unit_minutes: product.time_unit_minutes,
          time_start: product.is_time_based ? Date.now() : null,
        },
      ];
    });
  };

  const proceedToAdd = (product, variant) => {
    const applicable = applicableFor(product);
    if (applicable.length > 0) {
      setModifierPick({ product, variant });
      return;
    }
    addToCart(product, variant, []);
  };

  const handleProductTap = (product) => {
    const availableVariants = product.variants || [];
    if (availableVariants.length === 0) return;
    if (availableVariants.length === 1) {
      proceedToAdd(product, availableVariants[0]);
      return;
    }
    setVariantPickerProduct(product);
  };

  const updateQuantity = (id, change) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + change;
            return newQty > 0 ? { ...item, quantity: newQty } : item;
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const voidLine = (item) => {
    if (!activeTable) {
      setCart((prevCart) => prevCart.filter((i) => i.id !== item.id));
      return;
    }
    setVoidReasonModal(item);
  };

  const confirmVoidWithReason = async (reason) => {
    const item = voidReasonModal;
    if (!item || !activeTable) return;
    setCart((prevCart) => prevCart.filter((i) => i.id !== item.id));
    setVoidReasonModal(null);
    const kpGroups = routeItemsForKitchen([item], settings);
    for (const g of kpGroups) {
      await printKitchenTicket({
        type: "VOID",
        table: activeTable.name,
        billNumber: activeTable.open_order?.bill_number,
        voidedItem: item,
        voidedBy: user?.name || "Staff",
        voidReason: reason,
        settings,
        printer: g.printer,
      });
    }
  };

  const voidTicket = () => {
    if (cart.length === 0) return;
    if (window.confirm(t("void") + "?")) setCart([]);
  };

  const serializeCart = () =>
    cart.map((i) => ({
      variant_id: i.variant_id,
      product_id: i.product_id,
      category_id: i.category_id,
      name: i.name,
      description: i.description,
      price: i.price,
      quantity: i.quantity,
      modifiers: i.modifiers || [],
      is_time_based: i.is_time_based,
      time_unit_minutes: i.time_unit_minutes,
      time_start: i.time_start,
    }));

  const handleTableTap = async (tb) => {
    if (cart.length > 0) {
      Alert.alert(t("currentTicket"), "Park / " + t("void"));
      return;
    }
    if (tb.open_order) {
      const items = tb.open_order.items || [];
      const allProducts = await inventoryApi.getProducts();
      const loadedCart = items.map((i) => {
        const modsKey = (i.modifiers || []).map((m) => m.modifier_id).join("-");
        const product = allProducts.find((pp) => pp.id === i.product_id);
        return {
          ...i,
          id: String(i.variant_id) + (modsKey ? "_" + modsKey : ""),
          name: i.name || i.product_name || product?.name || "Item",
          is_time_based: product?.is_time_based || false,
          time_unit_minutes: product?.time_unit_minutes || null,
        };
      });
      setCart(loadedCart);
      setOriginalCartForTable(loadedCart);
    } else {
      setCart([]);
      setOriginalCartForTable([]);
    }
    setActiveTable(tb);
    setTablesView(false);
  };

  const detachTable = () => {
    setActiveTable(null);
    setCart([]);
    setOriginalCartForTable([]);
  };

  // ========== PRE-PRINT FUNCTIONS ==========
  const openPreprint = async (tb) => {
    if (!tb.open_order) return;
    setPreprintLoading(true);
    try {
      const items = tb.open_order.items || [];
      const allProducts = await inventoryApi.getProducts();
      const normalizedItems = items.map((i) => {
        const modsKey = (i.modifiers || []).map((m) => m.modifier_id).join("-");
        const product = allProducts.find((pp) => pp.id === i.product_id);
        return {
          ...i,
          id: String(i.variant_id) + (modsKey ? "_" + modsKey : ""),
          name: i.name || i.product_name || product?.name || "Item",
          is_time_based: product?.is_time_based || false,
          time_unit_minutes: product?.time_unit_minutes || null,
        };
      });

      const startTime = tb.open_order.created_at ? new Date(tb.open_order.created_at).getTime() : null;
      const finalItems = applyTimeCharges(normalizedItems, startTime, Date.now());

      const raw = finalItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      let pTax, pTotal;
      if (vatInclusive) {
        pTotal = raw;
        pTax = pTotal - pTotal / (1 + taxRate);
      } else {
        pTax = raw * taxRate;
        pTotal = raw + pTax;
      }

      setPreprintItems(finalItems);
      setPreprintTotals({ subtotal: raw, tax: pTax, total: pTotal });
      setPreprintTable(tb);
      setPreprintIsCopy(true);
    } catch (e) {
      Alert.alert("Error", "Failed to load table data for pre-print.");
    } finally {
      setPreprintLoading(false);
    }
  };

  const printPreprint = async () => {
    if (!preprintTable || !preprintTotals) return;
    try {
      const result = await printReceipt({
        items: preprintItems,
        subtotal: preprintTotals.subtotal,
        tax: preprintTotals.tax,
        total: preprintTotals.total,
        discount: 0,
        payment: null,
        store,
        settings,
        orderId: "PRE-" + preprintTable.id,
        billNumber: preprintTable.open_order?.bill_number,
        dining: "dine_in",
        table: preprintTable.name,
        duplicate: preprintIsCopy,
      });
      if (!result.success) Alert.alert("Print Failed", result.error || "Could not print.");
      setPreprintTable(null);
      setPreprintItems([]);
      setPreprintTotals(null);
    } catch (e) {
      Alert.alert("Print Error", e.message);
    }
  };

  const parkToTable = async () => {
    if (!activeTable) return;
    if (cart.length === 0) {
      Alert.alert(t("cartEmpty"));
      return;
    }
    
    const currentTable = activeTable;
    const isNewOrder = !currentTable.open_order;
    
    try {
      const addedItems =
        originalCartForTable.length === 0
          ? cart
          : cart
              .map((newItem) => {
                const origItem = originalCartForTable.find((o) => o.id === newItem.id);
                if (!origItem) return newItem;
                const diff = newItem.quantity - origItem.quantity;
                return diff > 0 ? { ...newItem, quantity: diff } : null;
              })
              .filter(Boolean);

      await backofficeApi.saveTableOrder(currentTable.id, serializeCart());

      Alert.alert("✅", t("parkOn") + " " + currentTable.name + " " + t("payLater"));
      setCart([]);
      setActiveTable(null);
      setOriginalCartForTable([]);
      setTablesView(true);
      loadTables();

      if (addedItems.length > 0) {
        try {
          const kpGroups = routeItemsForKitchen(addedItems, settings);
          for (const g of kpGroups) {
            await printKitchenTicket({
              type: isNewOrder ? "NEW" : "ADDITION",
              table: currentTable.name,
              billNumber: currentTable.open_order?.bill_number,
              dining: settings.diningEnabled ? diningOption : null,
              items: g.items,
              settings,
              printer: g.printer,
            });
          }
        } catch (printErr) {
          console.error("Kitchen print failed on park:", printErr);
        }
      }

    } catch (error) {
      console.error("Park table error:", error);
      Alert.alert("Error", "Failed to park order: " + (error.response?.data?.error || error.message || "Database connection issue."));
    }
  };

  const handleBarcodeScanned = async (code) => {
    const cleanCode = String(code || "").trim();
    if (!cleanCode) return;
    for (const product of products) {
      const variant = (product.variants || []).find((v) => v.barcode === code || v.sku === code);
      if (variant) {
        proceedToAdd(product, variant);
        return;
      }
    }
    try {
      const data = await inventoryApi.lookupBarcode(cleanCode);
      const productLike = {
        id: String(data.product_id),
        product_id: data.product_id,
        name: data.product_name,
        category_id: null,
        variants: [data.variant],
      };
      proceedToAdd(productLike, data.variant);
    } catch (error) {
      Alert.alert("Not Found", "No product found for barcode: " + cleanCode);
    }
  };

  const openPaymentModal = () => {
    if (cart.length === 0) {
      Alert.alert(t("cartEmpty"));
      return;
    }
    setPaymentMethod("cash");
    setAmountTendered(total.toFixed(dec));
    setSplitCash((total / 2).toFixed(dec));
    setDiningOption(activeTable ? "dine_in" : "takeaway");
    setPaymentModalVisible(true);
  };

  const tenderedValue = Number(amountTendered || 0);
  const changeDue = Math.max(0, tenderedValue - total);
  const splitCashNum = Number(splitCash || 0);
  const splitCard = Math.max(0, total - splitCashNum);

  const canConfirmPayment =
    paymentMethod === "cash"
      ? tenderedValue >= total
      : paymentMethod === "card"
      ? true
      : splitCashNum > 0 && splitCashNum <= total;

  const handleQrAccept = async (orderId) => {
    try {
      const order = qrOrders.find((o) => o.id === orderId);
      if (!order) return;

      await api.post(`/qr/order/${orderId}/accept`);
      setQrOrders((prev) => prev.filter((o) => o.id !== orderId));
      
      const table = tables.find((t) => t.id === order.table_id);
      if (table && order.items && order.items.length > 0) {
        const normalizedItems = order.items.map((item) => ({
          ...item,
          name: item.name || item.product_name || "Item",
        }));
        const kpGroups = routeItemsForKitchen(normalizedItems, settings);
        for (const g of kpGroups) {
          await printKitchenTicket({
            type: "NEW",
            table: table.name,
            billNumber: null,
            dining: "dine_in",
            items: g.items,
            settings,
            printer: g.printer,
          });
        }
      }
      
      loadTables();
    } catch (e) {
      Alert.alert("Error", "Failed to accept order.");
    }
  };

  const handleQrReject = async (orderId) => {
    try {
      await api.post(`/qr/order/${orderId}/reject`);
      setQrOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      Alert.alert("Error", "Failed to reject order.");
    }
  };

  const getTableName = (tableId) => {
    const tb = tables.find((t) => t.id === tableId);
    return tb ? tb.name : `Table ${tableId}`;
  };

  const handleCheckout = async (payment) => {
    if (processing) return;
    setProcessing(true);
    try {
      const billNumber = await nextReceiptNumber(settings);
      const finalCart = applyTimeCharges(cart, orderStartTime, Date.now());
      const finalSubtotal = finalCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const dv = Number(discountValue || 0);
      const finalDiscount = Math.min(finalSubtotal, discountType === "percent" ? (finalSubtotal * dv) / 100 : dv);
      const afterDiscount = finalSubtotal - finalDiscount;
      let finalTax, finalTotal;
      if (vatInclusive) {
        finalTotal = afterDiscount;
        finalTax = finalTotal - finalTotal / (1 + taxRate);
      } else {
        finalTax = afterDiscount * taxRate;
        finalTotal = afterDiscount + finalTax;
      }

      const order = await createOrder({
        cart: finalCart,
        subtotal: finalSubtotal,
        tax: finalTax,
        total: finalTotal,
        discount: finalDiscount,
        dining: settings.diningEnabled ? diningOption : null,
        table: activeTable ? activeTable.name : null,
        user,
        store,
        payment,
      });

      if (!activeTable) {
        const ticketTable = diningOption === "takeaway" ? "TAKEAWAY" : (settings.diningEnabled ? "DINE-IN" : "COUNTER");
        const kpGroups = routeItemsForKitchen(finalCart, settings);
        for (const g of kpGroups) {
          try {
            await printKitchenTicket({
              type: "NEW",
              table: ticketTable,
              billNumber: billNumber,
              dining: diningOption,
              items: g.items,
              settings,
              printer: g.printer,
            });
          } catch (printErr) {
            console.error("Kitchen print failed:", printErr);
          }
        }
      }

      const quantityByVariant = {};
      finalCart.forEach((cartItem) => {
        quantityByVariant[cartItem.variant_id] = (quantityByVariant[cartItem.variant_id] || 0) + cartItem.quantity;
      });
      setProducts((prevProducts) =>
        prevProducts.map((product) => {
          const updatedVariants = (product.variants || []).map((variant) => {
            const sold = quantityByVariant[variant.id] || 0;
            if (!sold) return variant;
            return { ...variant, stock_quantity: Number(variant.stock_quantity || 0) - sold };
          });
          const totalStock = updatedVariants.reduce((s, v) => s + Number(v.stock_quantity || 0), 0);
          return { ...product, variants: updatedVariants, stock_quantity: totalStock };
        })
      );

      await syncOfflineOrders();
      if (activeTable) {
        await backofficeApi.clearTableOrder(activeTable.id).catch(() => {});
        loadTables();
      }

      const cd = settings.cashDrawer || {};
      const isCashPayment = payment && payment.payment_method === "cash";
      if (cd.enabled && cd.autoOnCash !== false && isCashPayment) {
        try {
          const mod = await import("../services/printerService");
          await mod.openCashDrawer(settings);
        } catch (e) {
          console.warn("Auto-open drawer failed:", e);
        }
      }

      setCompletedSale({
        items: finalCart,
        subtotal: finalSubtotal,
        tax: finalTax,
        total: finalTotal,
        discount: finalDiscount,
        payment,
        orderId: order.client_order_id,
        dining: settings.diningEnabled ? diningOption : null,
        table: activeTable ? activeTable.name : null,
        billNumber,
      });
      setCart([]);
      setDiscountValue("");
      setActiveTable(null);
    } catch (error) {
      Alert.alert("Checkout Failed", error.message);
    } finally {
      setProcessing(false);
    }
  };

  const confirmPayment = () => {
    let payment;
    if (paymentMethod === "cash") {
      payment = { payment_method: "cash", amount_tendered: tenderedValue, change_due: changeDue, payments: [{ method: "cash", amount: total }] };
    } else if (paymentMethod === "card") {
      payment = { payment_method: "card", amount_tendered: total, change_due: 0, payments: [{ method: "card", amount: total }] };
    } else {
      payment = {
        payment_method: "split",
        amount_tendered: total,
        change_due: 0,
        payments: [
          { method: "cash", amount: splitCashNum },
          { method: "card", amount: splitCard },
        ],
      };
    }
    setPaymentModalVisible(false);
    handleCheckout(payment);
  };

  const handlePrintAndSave = async () => {
    if (!completedSale) return;
    const result = await printReceipt({
      items: completedSale.items,
      subtotal: completedSale.subtotal,
      tax: completedSale.tax,
      total: completedSale.total,
      payment: completedSale.payment,
      store,
      settings,
      orderId: completedSale.orderId,
      dining: completedSale.dining,
      table: completedSale.table,
      billNumber: completedSale.billNumber,
    });
    if (!result.success) Alert.alert("Print Failed", result.error || "Could not print.");
    setCompletedSale(null);
  };

  const openCashModal = (type) => {
    setCashAmount("");
    setCashNote("");
    setCashModal(type);
  };

  const confirmCashMovement = async () => {
    const amount = Number(cashAmount || 0);
    if (!amount || amount <= 0) {
      Alert.alert("Error", t("amountLabel") + "?");
      return;
    }
    try {
      setSavingCash(true);
      await backofficeApi.addCashMovement({ type: cashModal, amount, note: cashNote.trim() });
      Alert.alert("✅", (cashModal === "cash_in" ? t("cashIn") : t("cashOut")) + " " + fm(amount));
      setCashModal(null);
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed.");
    } finally {
      setSavingCash(false);
    }
  };

  const formatTimer = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const getTimerColor = (seconds) => {
    if (seconds < 1800) return "#16A34A";
    if (seconds < 3600) return "#F59E0B";
    return "#DC2626";
  };

  const renderGridCard = (item) => {
    const noStock = item.track_stock && item.stock_quantity <= 0;
    return (
      <TouchableOpacity key={item.id} style={[styles.productCard, noStock && styles.outOfStockCard]} onPress={() => handleProductTap(item)}>
        <View style={styles.productImageBox}>
          {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" /> : <Text style={styles.productIcon}>🍽️</Text>}
        </View>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.productDesc} numberOfLines={1}>{item.description || " "}</Text>
        <Text style={styles.productPrice}>{fm(item.price)}</Text>
        <Text style={styles.outOfStockText}>{noStock ? t("outOfStock") : " "}</Text>
      </TouchableOpacity>
    );
  };

  const renderListRow = (item) => (
    <TouchableOpacity key={item.id} style={[styles.listCard, item.track_stock && item.stock_quantity <= 0 && styles.outOfStockCard]} onPress={() => handleProductTap(item)}>
      <View style={styles.listIcon}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.listImage} resizeMode="cover" /> : <Text style={{ fontSize: 22 }}>🍽️</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.listName}>{item.name}</Text>
        <Text style={styles.listMeta}>{item.description || (t("stock") + ": " + item.stock_quantity)}</Text>
      </View>
      <Text style={styles.listPrice}>{fm(item.price)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <HardwareScannerInput
        onBarcode={handleBarcodeScanned}
        active={!scannerVisible && !paymentModalVisible && !variantPickerProduct && !modifierPick && !completedSale && !cashModal && !discountModalVisible && !voidReasonModal && !preprintTable}
      />

      <View style={styles.productsPanel}>
        <View style={styles.searchContainer}>
          <TextInput style={styles.searchInput} placeholder={t("searchProducts")} placeholderTextColor={p.muted} value={search} onChangeText={setSearch} />
          {settings.tablesEnabled ? null : (
            <TouchableOpacity style={styles.scanButton} onPress={() => setScannerVisible(true)}>
              <Text style={styles.scanButtonText}>📷 {t("scan")}</Text>
            </TouchableOpacity>
          )}
          {settings.tablesEnabled ? (
            <TouchableOpacity style={[styles.scanButton, styles.tablesButton]} onPress={() => { setTablesView(!tablesView); loadTables(); }}>
              <Text style={styles.scanButtonText}>🪑 {t("tables")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar} contentContainerStyle={{ alignItems: "center" }}>
          <TouchableOpacity style={[styles.catChip, selectedCategory == null && styles.catChipActive]} onPress={() => setSelectedCategory(null)}>
            <Text style={[styles.catChipText, selectedCategory == null && styles.catChipTextActive]}>{t("all")}</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.catChip, selectedCategory === c.id && styles.catChipActive]} onPress={() => setSelectedCategory(c.id)}>
              <Text style={[styles.catChipText, selectedCategory === c.id && styles.catChipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {tablesView ? (
          <ScrollView contentContainerStyle={styles.gridContainer}>
            {tables.map((tb) => {
              const occupied = Boolean(tb.open_order);
              const tTotal = tb.open_order ? (tb.open_order.items || []).reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 0), 0) : 0;
              const hasVoidedItems = tb.open_order?.voided_items?.length > 0;
              const timerStart = tb.open_order?.created_at ? new Date(tb.open_order.created_at).getTime() : null;
              const elapsedSeconds = timerStart ? Math.floor((nowTick - timerStart) / 1000) : 0;
              const timeBasedCost = tb.open_order
                ? (tb.open_order.items || []).reduce((sum, item) => {
                    if (!item.is_time_based || !item.time_unit_minutes) return sum;
                    const elapsed = Math.floor((nowTick - (item.time_start || timerStart)) / 1000 / 60);
                    const units = Math.ceil(elapsed / item.time_unit_minutes);
                    return sum + units * Number(item.price || 0);
                  }, 0)
                : 0;

              return (
                <View key={tb.id} style={[styles.productCard, { borderWidth: 2, borderColor: occupied ? p.danger : p.accent, position: "relative" }]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => handleTableTap(tb)}>
                    {hasVoidedItems ? (
                      <View style={styles.voidBadge}>
                        <Text style={styles.voidBadgeText}>VOID</Text>
                      </View>
                    ) : null}
                    {settings.tableTimingEnabled && occupied && timerStart ? (
                      <View style={[styles.timerBadge, { backgroundColor: getTimerColor(elapsedSeconds) }]}>
                        <Text style={styles.timerBadgeText}>⏱ {formatTimer(elapsedSeconds)}</Text>
                      </View>
                    ) : null}
                    <View style={styles.productIconContainer}>
                      <Text style={styles.productIcon}>{occupied ? "🔴" : "🟢"}</Text>
                    </View>
                    <Text style={styles.productName} numberOfLines={1}>{tb.name}</Text>
                    <Text style={styles.productDesc}>{" "}</Text>
                    <Text style={styles.productPrice}>{occupied ? fm(tTotal + timeBasedCost) : t("free")}</Text>
                    <Text style={styles.outOfStockText}>{" "}</Text>
                  </TouchableOpacity>
                  {occupied && (
                    <TouchableOpacity style={styles.preprintBtn} onPress={() => openPreprint(tb)} title="Pre-print Bill">
                      <Text style={styles.preprintBtnText}>🖨️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        ) : loadingProducts ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={p.accent} />
          </View>
        ) : settings.productLayout === "list" ? (
          <ScrollView contentContainerStyle={styles.listContainer}>{filteredProducts.map(renderListRow)}</ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.gridContainer}>{filteredProducts.map(renderGridCard)}</ScrollView>
        )}
      </View>

      <View style={styles.cartPanel}>
        <View style={styles.cartHeader}>
          <View style={styles.cartHeaderLeft}>
            {can("cash") ? (
              <View style={styles.cashBtnRow}>
                <TouchableOpacity style={styles.cashInButton} onPress={() => openCashModal("cash_in")}>
                  <Text style={styles.cashInText}>💵 {t("cashIn")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cashOutButton} onPress={() => openCashModal("cash_out")}>
                  <Text style={styles.cashOutText}>💸 {t("cashOut")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={styles.cartTitle}>{t("currentTicket")}</Text>
            {activeTable ? (
              <TouchableOpacity style={{ backgroundColor: p.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }} onPress={detachTable}>
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>🪑 {activeTable.name}</Text>
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.cartHeaderRight}>
            <TouchableOpacity onPress={voidTicket} style={{ paddingHorizontal: 6 }}>
              <Text style={styles.voidAllText}>{t("void")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.cartList}>
          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartIcon}>🛒</Text>
              <Text style={styles.emptyCartText}>{t("cartEmpty")}</Text>
            </View>
          ) : (
            displayCart.map((item) => (
              <View key={item.id} style={styles.cartItem}>
                <View style={styles.cartItemLeft}>
                  <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                  {item.time_elapsed_minutes ? (
                    <Text style={styles.cartItemMods}>⏱ {formatTimer(item.time_elapsed_minutes * 60)} • {item.time_units} × {item.time_unit_minutes}min</Text>
                  ) : null}
                  {item.modifiers && item.modifiers.length > 0 ? (
                    <Text style={styles.cartItemMods}>{item.modifiers.map((m) => "+ " + m.name).join(", ")}</Text>
                  ) : null}
                  <Text style={styles.cartItemPrice}>{item.quantity} × {fm(item.price)} = {fm(item.price * item.quantity)}</Text>
                </View>
                <View style={styles.quantityControls}>
                  <TouchableOpacity onPress={() => updateQuantity(item.id, -1)} style={styles.qtyBtn}>
                    <Text style={styles.qtyBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => updateQuantity(item.id, 1)} style={styles.qtyBtn}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => voidLine(item)} style={styles.voidButton}>
                  <Text style={styles.voidButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.cartFooter}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{t("subtotal")}</Text>
            <Text style={styles.totalsValue}>{fm(subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{t("discount")}</Text>
            {can("discounts") ? (
              <TouchableOpacity onPress={() => setDiscountModalVisible(true)}>
                <Text style={styles.discountValue}>{"-" + fm(discount) + " ✏️"}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.discountValue}>{"-" + fm(discount)}</Text>
            )}
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{vatInclusive ? t("vatIncl") : t("vatExcl")}</Text>
            <Text style={styles.totalsValue}>{fm(tax)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.totalRow]}>
            <Text style={styles.bold}>{t("total")}</Text>
            <Text style={styles.bold}>{fm(total)}</Text>
          </View>

          {activeTable ? (
            <TouchableOpacity style={[styles.payButton, { backgroundColor: "#64748B" }]} onPress={parkToTable}>
              <Text style={styles.payButtonText}>🪑 {t("parkOn")} {activeTable.name}</Text>
            </TouchableOpacity>
          ) : null}

          {settings.cashDrawer && settings.cashDrawer.enabled ? (
            <TouchableOpacity
              style={[styles.payButton, { backgroundColor: "#F59E0B" }]}
              onPress={async () => {
                try {
                  const mod = await import("../services/printerService");
                  const res = await mod.openCashDrawer(settings);
                  if (!res.success) Alert.alert("Drawer Error", res.error || "Could not open drawer.");
                } catch (e) {
                  Alert.alert("Drawer Error", e.message);
                }
              }}
            >
              <Text style={styles.payButtonText}>💰 Open Cash Drawer</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={[styles.payButton, { marginBottom: 0 }]} onPress={openPaymentModal} disabled={processing}>
            <Text style={styles.payButtonText}>{processing ? t("processing") : t("charge") + " " + fm(total)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {qrOrders.length > 0 && (
        <View style={styles.qrPanel}>
          <View style={styles.qrPanelHeader}>
            <Text style={styles.qrPanelTitle}>📲 QR Orders</Text>
            <View style={styles.qrPanelBadge}>
              <Text style={styles.qrPanelBadgeText}>{qrOrders.length}</Text>
            </View>
          </View>
          <ScrollView style={styles.qrPanelList}>
            {qrOrders.map((order) => (
              <View key={order.id} style={styles.qrOrderItem}>
                <View style={styles.qrOrderHeader}>
                  <Text style={styles.qrOrderTable}>🪑 {getTableName(order.table_id)}</Text>
                  <Text style={styles.qrOrderTime}>
                    {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Text style={styles.qrOrderItems}>
                  {order.items.length} item{order.items.length !== 1 ? "s" : ""}: {order.items.map((i) => i.name || i.product_name || "Item").join(", ")}
                </Text>
                <View style={styles.qrOrderActions}>
                  <TouchableOpacity style={styles.qrAcceptBtn} onPress={() => handleQrAccept(order.id)}>
                    <Text style={styles.qrAcceptText}>✅ Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.qrRejectBtn} onPress={() => handleQrReject(order.id)}>
                    <Text style={styles.qrRejectText}>❌ Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <VariantPickerModal
        product={variantPickerProduct}
        visible={Boolean(variantPickerProduct)}
        onClose={() => setVariantPickerProduct(null)}
        onSelectVariant={(product, variant) => {
          setVariantPickerProduct(null);
          proceedToAdd(product, variant);
        }}
      />

      <ModifierModal
        visible={Boolean(modifierPick)}
        product={modifierPick ? modifierPick.product : null}
        modifiers={modifiers}
        onClose={() => setModifierPick(null)}
        onConfirm={(selected) => {
          if (modifierPick) addToCart(modifierPick.product, modifierPick.variant, selected);
          setModifierPick(null);
        }}
      />

      <BarcodeScannerModal visible={scannerVisible} onClose={() => setScannerVisible(false)} onScanned={handleBarcodeScanned} />

      {/* ========== PRE-PRINT MODAL ========== */}
      <Modal visible={Boolean(preprintTable)} transparent animationType="fade" onRequestClose={() => setPreprintTable(null)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>🖨️ Pre-print Bill</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: p.text, marginBottom: 6 }}>
              🪑 {preprintTable ? preprintTable.name : ""}
            </Text>
            <Text style={{ fontSize: 14, color: p.muted, marginBottom: 16 }}>
              {preprintItems.length} item{preprintItems.length !== 1 ? "s" : ""} • Running total: {preprintTotals ? fm(preprintTotals.total) : ""}
            </Text>

            {/* Items list */}
            <ScrollView style={{ maxHeight: 200, marginBottom: 16, borderWidth: 1, borderColor: p.border, borderRadius: 8, paddingHorizontal: 12 }}>
              {preprintItems.map((item, idx) => (
                <View key={idx} style={styles.preprintItemRow}>
                  <Text style={styles.preprintItemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.preprintItemQty}>{item.quantity}x</Text>
                  <Text style={styles.preprintItemPrice}>{fm(item.price * item.quantity)}</Text>
                </View>
              ))}
            </ScrollView>

            {/* COPY toggle */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: preprintIsCopy ? p.accent : p.surface2, borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 2, borderColor: preprintIsCopy ? p.accent : p.border }}
                onPress={() => setPreprintIsCopy(!preprintIsCopy)}
              >
                <Text style={{ color: preprintIsCopy ? "#fff" : p.text, fontWeight: "bold", fontSize: 14 }}>
                  {preprintIsCopy ? "✅ Print as COPY" : "⬜ Print as Original"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: p.muted, marginBottom: 20, textAlign: "center" }}>
              COPY adds a "★ DUPLICATE BILL ★" header so it's not confused with the final receipt.
            </Text>

            {/* Action buttons */}
            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => setPreprintTable(null)}>
                <Text style={styles.paymentCancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={printPreprint}>
                <Text style={styles.paymentConfirmText}>🖨️ Print Pre-bill</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={paymentModalVisible} transparent animationType="fade" onRequestClose={() => setPaymentModalVisible(false)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>{t("payment")}</Text>
            <Text style={styles.paymentTotal}>{t("total")}: {fm(total)}</Text>

            {settings.diningEnabled ? (
              <View style={styles.paymentMethodRow}>
                <TouchableOpacity style={[styles.paymentMethodButton, diningOption === "dine_in" && styles.paymentMethodActive]} onPress={() => setDiningOption("dine_in")}>
                  <Text style={[styles.paymentMethodText, diningOption === "dine_in" && styles.paymentMethodTextActive]}>🍽 {t("dineIn")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.paymentMethodButton, diningOption === "takeaway" && styles.paymentMethodActive]} onPress={() => setDiningOption("takeaway")}>
                  <Text style={[styles.paymentMethodText, diningOption === "takeaway" && styles.paymentMethodTextActive]}>🥡 {t("takeaway")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.paymentMethodRow}>
              <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === "cash" && styles.paymentMethodActive]} onPress={() => setPaymentMethod("cash")}>
                <Text style={[styles.paymentMethodText, paymentMethod === "cash" && styles.paymentMethodTextActive]}>{t("cash")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === "card" && styles.paymentMethodActive]} onPress={() => setPaymentMethod("card")}>
                <Text style={[styles.paymentMethodText, paymentMethod === "card" && styles.paymentMethodTextActive]}>{t("card")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === "split" && styles.paymentMethodActive]} onPress={() => setPaymentMethod("split")}>
                <Text style={[styles.paymentMethodText, paymentMethod === "split" && styles.paymentMethodTextActive]}>{t("split")}</Text>
              </TouchableOpacity>
            </View>

            {paymentMethod === "cash" ? (
              <View>
                <Text style={styles.paymentLabel}>{t("amountReceived")}</Text>
                <TextInput style={styles.paymentInput} value={amountTendered} onChangeText={setAmountTendered} keyboardType="decimal-pad" />
                <Text style={styles.paymentChange}>{t("change")}: {fm(changeDue)}</Text>
              </View>
            ) : null}

            {paymentMethod === "split" ? (
              <View>
                <Text style={styles.paymentLabel}>{t("cashPart")}</Text>
                <TextInput style={styles.paymentInput} value={splitCash} onChangeText={setSplitCash} keyboardType="decimal-pad" />
                <Text style={styles.paymentChange}>{t("cardPart")}: {fm(splitCard)}</Text>
              </View>
            ) : null}

            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => setPaymentModalVisible(false)}>
                <Text style={styles.paymentCancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentConfirmButton, !canConfirmPayment && styles.paymentConfirmDisabled]} onPress={confirmPayment} disabled={!canConfirmPayment}>
                <Text style={styles.paymentConfirmText}>{t("confirm")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={discountModalVisible} transparent animationType="fade" onRequestClose={() => setDiscountModalVisible(false)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>{t("ticketDiscount")}</Text>
            <View style={styles.paymentMethodRow}>
              <TouchableOpacity style={[styles.paymentMethodButton, discountType === "percent" && styles.paymentMethodActive]} onPress={() => setDiscountType("percent")}>
                <Text style={[styles.paymentMethodText, discountType === "percent" && styles.paymentMethodTextActive]}>{t("percent")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentMethodButton, discountType === "fixed" && styles.paymentMethodActive]} onPress={() => setDiscountType("fixed")}>
                <Text style={[styles.paymentMethodText, discountType === "fixed" && styles.paymentMethodTextActive]}>{t("fixedAmount")}</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.paymentInput} value={discountValue} onChangeText={setDiscountValue} keyboardType="decimal-pad" placeholder={discountType === "percent" ? "10" : "5.00"} placeholderTextColor={p.muted} />
            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => { setDiscountValue(""); setDiscountModalVisible(false); }}>
                <Text style={styles.paymentCancelText}>{t("remove")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={() => setDiscountModalVisible(false)}>
                <Text style={styles.paymentConfirmText}>{t("apply")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(completedSale)} transparent animationType="fade">
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>{t("saleCompleted")}</Text>
            <Text style={styles.paymentTotal}>{t("total")}: {completedSale ? fm(completedSale.total) : fm(0)}</Text>
            {settings.printer.enabled ? (
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={handlePrintAndSave}>
                <Text style={styles.paymentConfirmText}>{t("printSave")}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.paymentCancelButton, { marginTop: 12 }]} onPress={() => setCompletedSale(null)}>
              <Text style={styles.paymentCancelText}>{t("saveOnly")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(cashModal)} transparent animationType="fade" onRequestClose={() => setCashModal(null)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>{cashModal === "cash_in" ? "💵 " + t("cashIn") : "💸 " + t("cashOut")}</Text>
            <Text style={styles.paymentLabel}>{t("amountLabel")}</Text>
            <TextInput style={styles.paymentInput} value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={p.muted} />
            <Text style={styles.paymentLabel}>{t("note")}</Text>
            <TextInput
              style={styles.noteInput}
              value={cashNote}
              onChangeText={setCashNote}
              placeholder={cashModal === "cash_in" ? "e.g. Owner added float" : "e.g. Bought cleaning supplies"}
              placeholderTextColor={p.muted}
              multiline
            />
            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => setCashModal(null)}>
                <Text style={styles.paymentCancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={confirmCashMovement} disabled={savingCash}>
                <Text style={styles.paymentConfirmText}>{savingCash ? t("processing") : t("save")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(voidReasonModal)} transparent animationType="fade" onRequestClose={() => setVoidReasonModal(null)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>{t("voidReason") || "Void Reason"}</Text>
            <Text style={styles.paymentLabel}>{t("reason") || "Why is this item being voided?"}</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. Customer changed mind, wrong item, etc."
              placeholderTextColor={p.muted}
              multiline
              autoFocus
              onChangeText={(text) => setVoidReasonModal({ ...voidReasonModal, _reason: text })}
            />
            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => setVoidReasonModal(null)}>
                <Text style={styles.paymentCancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={() => confirmVoidWithReason(voidReasonModal._reason || "")}>
                <Text style={styles.paymentConfirmText}>{t("confirmVoid") || "Void & Print"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}