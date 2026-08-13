import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, ActivityIndicator } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { inventoryApi } from "../api/inventory";
import { backofficeApi } from "../api/backoffice";
import { createOrder } from "../services/orderService";
import { syncOfflineOrders } from "../services/syncService";
import { printReceipt } from "../services/printerService";
import VariantPickerModal from "../components/VariantPickerModal";
import ModifierModal from "../components/ModifierModal";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import HardwareScannerInput from "../components/HardwareScannerInput";

export default function POSHomeScreen() {
  const { user, store } = useAuth();
  const { settings } = useSettings();

  const [products, setProducts] = useState([]);
  const [modifiers, setModifiers] = useState([]);
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
  const [processing, setProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);

  const [cashModal, setCashModal] = useState(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [savingCash, setSavingCash] = useState(false);
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");

  const taxRate = Number(store?.tax_rate || 0) / 100;
  const vatInclusive = Boolean(store && store.tax_inclusive);

    const { subtotal, discount, tax, total } = useMemo(() => {
    const raw = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const dv = Number(discountValue || 0);
    const discountAmount = Math.min(raw, discountType === "percent" ? (raw * dv) / 100 : dv);
    const afterDiscount = raw - discountAmount;
    if (vatInclusive) {
      const totalV = afterDiscount;
      const taxV = totalV - totalV / (1 + taxRate);
      return { subtotal: afterDiscount, discount: discountAmount, tax: taxV, total: totalV };
    }
    const taxV = afterDiscount * taxRate;
    return { subtotal: afterDiscount, discount: discountAmount, tax: taxV, total: afterDiscount + taxV };
  }, [cart, taxRate, vatInclusive, discountType, discountValue]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingProducts(true);
        const [productData, modifierData] = await Promise.all([
          inventoryApi.getProducts(),
          backofficeApi.getModifiers().catch(() => []),
        ]);
        const mapped = productData.map((product) => {
          const variants = product.variants || [];
          const totalStock = variants.reduce((s, v) => s + Number(v.stock_quantity || 0), 0);
          const minPrice = variants.length ? Math.min(...variants.map((v) => Number(v.price || 0))) : 0;
          return {
            id: String(product.id),
            product_id: product.id,
            name: product.name,
            category_id: product.category_id,
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

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

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
          name: displayName,
          price: unitPrice,
          quantity: 1,
          modifiers: modsList.map((m) => ({ modifier_id: m.id, name: m.name, price: Number(m.price || 0) })),
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

  const voidLine = (id) => setCart((prevCart) => prevCart.filter((item) => item.id !== id));

  const voidTicket = () => {
    if (cart.length === 0) return;
    Alert.alert("Void Ticket", "Remove ALL items from the current ticket?", [
      { text: "Cancel", style: "cancel" },
      { text: "Void", style: "destructive", onPress: () => setCart([]) },
    ]);
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
      const productLike = { id: String(data.product_id), product_id: data.product_id, name: data.product_name, category_id: null, variants: [data.variant] };
      proceedToAdd(productLike, data.variant);
    } catch (error) {
      Alert.alert("Not Found", "No product found for barcode: " + cleanCode);
    }
  };

  const openPaymentModal = () => {
    if (cart.length === 0) {
      Alert.alert("Cart is Empty");
      return;
    }
    setPaymentMethod("cash");
    setAmountTendered(total.toFixed(2));
    setSplitCash((total / 2).toFixed(2));
    setPaymentModalVisible(true);
  };

  const tenderedValue = Number(amountTendered || 0);
  const changeDue = Math.max(0, tenderedValue - total);
  const splitCashNum = Number(splitCash || 0);
  const splitCard = Math.max(0, total - splitCashNum);

  const canConfirmPayment =
    paymentMethod === "cash" ? tenderedValue >= total : paymentMethod === "card" ? true : splitCashNum > 0 && splitCashNum <= total;

  const handleCheckout = async (payment) => {
    if (processing) return;
    setProcessing(true);
    try {
      const order = await createOrder({ cart, subtotal, tax, total, discount, user, store, payment });
      const quantityByVariant = {};
      cart.forEach((cartItem) => {
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
      setCompletedSale({ items: cart, subtotal, tax, total, discount, payment, orderId: order.client_order_id });
      setCart([]);
      setDiscountValue("");
      setCart([]);
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
      Alert.alert("Error", "Enter a valid amount.");
      return;
    }
    try {
      setSavingCash(true);
      await backofficeApi.addCashMovement({ type: cashModal, amount, note: cashNote.trim() });
      Alert.alert("Saved", (cashModal === "cash_in" ? "Cash In" : "Cash Out") + " of $" + amount.toFixed(2) + " recorded.");
      setCashModal(null);
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed to save cash movement.");
    } finally {
      setSavingCash(false);
    }
  };

  const renderGridCard = (item) => (
    <TouchableOpacity key={item.id} style={[styles.productCard, item.stock_quantity <= 0 && styles.outOfStockCard]} onPress={() => handleProductTap(item)}>
      <View style={styles.productIconContainer}><Text style={styles.productIcon}>📦</Text></View>
      <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
      {item.stock_quantity <= 0 && <Text style={styles.outOfStockText}>Out of Stock</Text>}
    </TouchableOpacity>
  );

  const renderListRow = (item) => (
    <TouchableOpacity key={item.id} style={[styles.listCard, item.stock_quantity <= 0 && styles.outOfStockCard]} onPress={() => handleProductTap(item)}>
      <View style={styles.listIcon}><Text style={styles.productIcon}>📦</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.listName}>{item.name}</Text>
        <Text style={styles.listMeta}>Stock: {item.stock_quantity}</Text>
      </View>
      <Text style={styles.listPrice}>${item.price.toFixed(2)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <HardwareScannerInput
        onBarcode={handleBarcodeScanned}
        active={!scannerVisible && !paymentModalVisible && !variantPickerProduct && !modifierPick && !completedSale && !cashModal}
      />

      <View style={styles.productsPanel}>
        <View style={styles.searchContainer}>
          <TextInput style={styles.searchInput} placeholder="Search products..." value={search} onChangeText={setSearch} />
          <TouchableOpacity style={styles.scanButton} onPress={() => setScannerVisible(true)}>
            <Text style={styles.scanButtonText}>📷 Scan</Text>
          </TouchableOpacity>
        </View>

        {loadingProducts ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#43A047" /></View>
        ) : settings.productLayout === "list" ? (
          <ScrollView contentContainerStyle={styles.listContainer}>{filteredProducts.map(renderListRow)}</ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.gridContainer}>{filteredProducts.map(renderGridCard)}</ScrollView>
        )}
      </View>

      <View style={styles.cartPanel}>
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>Current Ticket</Text>
          <TouchableOpacity onPress={voidTicket}><Text style={styles.voidAllText}>Void</Text></TouchableOpacity>
        </View>

        <View style={styles.cashRow}>
          <TouchableOpacity style={styles.cashInButton} onPress={() => openCashModal("cash_in")}>
            <Text style={styles.cashInText}>💵 Cash In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cashOutButton} onPress={() => openCashModal("cash_out")}>
            <Text style={styles.cashOutText}>💸 Cash Out</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.cartList}>
          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <Text style={styles.emptyCartIcon}>🛒</Text>
              <Text style={styles.emptyCartText}>Cart is empty</Text>
            </View>
          ) : (
            cart.map((item) => (
              <View key={item.id} style={styles.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName}>{item.name}</Text>
                  {item.modifiers && item.modifiers.length > 0 ? (
                    <Text style={styles.cartItemMods}>{item.modifiers.map((m) => "+ " + m.name).join(", ")}</Text>
                  ) : null}
                  <Text style={styles.cartItemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
                </View>
                <View style={styles.quantityControls}>
                  <TouchableOpacity onPress={() => updateQuantity(item.id, -1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => updateQuantity(item.id, 1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => voidLine(item.id)} style={styles.voidButton}><Text style={styles.voidButtonText}>✕</Text></TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.cartFooter}>
          <View style={styles.totalsRow}><Text style={styles.totalsLabel}>Subtotal</Text><Text style={styles.totalsValue}>${subtotal.toFixed(2)}</Text></View>
		   <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Discount</Text>
            <TouchableOpacity onPress={() => setDiscountModalVisible(true)}>
              <Text style={styles.discountValue}>-${discount.toFixed(2)} ✏️</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.totalsRow}><Text style={styles.totalsLabel}>{vatInclusive ? "VAT (incl)" : "VAT (excl)"}</Text><Text style={styles.totalsValue}>${tax.toFixed(2)}</Text></View>
          <View style={[styles.totalsRow, styles.totalRow]}><Text style={styles.bold}>TOTAL</Text><Text style={styles.bold}>${total.toFixed(2)}</Text></View>
          <TouchableOpacity style={styles.payButton} onPress={openPaymentModal} disabled={processing}>
            <Text style={styles.payButtonText}>{processing ? "Processing..." : "Charge $" + total.toFixed(2)}</Text>
          </TouchableOpacity>
        </View>
      </View>

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

      <Modal visible={paymentModalVisible} transparent animationType="fade" onRequestClose={() => setPaymentModalVisible(false)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Payment</Text>
            <Text style={styles.paymentTotal}>Total: ${total.toFixed(2)}</Text>

            <View style={styles.paymentMethodRow}>
              <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === "cash" && styles.paymentMethodActive]} onPress={() => setPaymentMethod("cash")}>
                <Text style={[styles.paymentMethodText, paymentMethod === "cash" && styles.paymentMethodTextActive]}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === "card" && styles.paymentMethodActive]} onPress={() => setPaymentMethod("card")}>
                <Text style={[styles.paymentMethodText, paymentMethod === "card" && styles.paymentMethodTextActive]}>Card</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentMethodButton, paymentMethod === "split" && styles.paymentMethodActive]} onPress={() => setPaymentMethod("split")}>
                <Text style={[styles.paymentMethodText, paymentMethod === "split" && styles.paymentMethodTextActive]}>Split</Text>
              </TouchableOpacity>
            </View>

            {paymentMethod === "cash" ? (
              <View>
                <Text style={styles.paymentLabel}>Amount Received</Text>
                <TextInput style={styles.paymentInput} value={amountTendered} onChangeText={setAmountTendered} keyboardType="decimal-pad" />
                <Text style={styles.paymentChange}>Change: ${changeDue.toFixed(2)}</Text>
              </View>
            ) : null}

            {paymentMethod === "split" ? (
              <View>
                <Text style={styles.paymentLabel}>Cash Part</Text>
                <TextInput style={styles.paymentInput} value={splitCash} onChangeText={setSplitCash} keyboardType="decimal-pad" />
                <Text style={styles.paymentChange}>Card Part: ${splitCard.toFixed(2)}</Text>
              </View>
            ) : null}

            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => setPaymentModalVisible(false)}>
                <Text style={styles.paymentCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentConfirmButton, !canConfirmPayment && styles.paymentConfirmDisabled]} onPress={confirmPayment} disabled={!canConfirmPayment}>
                <Text style={styles.paymentConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(completedSale)} transparent animationType="fade">
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Sale Completed ✅</Text>
            <Text style={styles.paymentTotal}>Total: ${completedSale ? completedSale.total.toFixed(2) : "0.00"}</Text>
            {settings.printer.enabled ? (
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={handlePrintAndSave}>
                <Text style={styles.paymentConfirmText}>🖨 Print & Save</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.paymentCancelButton, { marginTop: 12 }]} onPress={() => setCompletedSale(null)}>
              <Text style={styles.paymentCancelText}>💾 Save Only</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={discountModalVisible} transparent animationType="fade" onRequestClose={() => setDiscountModalVisible(false)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Ticket Discount</Text>
            <View style={styles.paymentMethodRow}>
              <TouchableOpacity style={[styles.paymentMethodButton, discountType === "percent" && styles.paymentMethodActive]} onPress={() => setDiscountType("percent")}>
                <Text style={[styles.paymentMethodText, discountType === "percent" && styles.paymentMethodTextActive]}>% Percent</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentMethodButton, discountType === "fixed" && styles.paymentMethodActive]} onPress={() => setDiscountType("fixed")}>
                <Text style={[styles.paymentMethodText, discountType === "fixed" && styles.paymentMethodTextActive]}>$ Amount</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.paymentInput} value={discountValue} onChangeText={setDiscountValue} keyboardType="decimal-pad" placeholder={discountType === "percent" ? "10" : "5.00"} />
            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => { setDiscountValue(""); setDiscountModalVisible(false); }}>
                <Text style={styles.paymentCancelText}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={() => setDiscountModalVisible(false)}>
                <Text style={styles.paymentConfirmText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(cashModal)} transparent animationType="fade" onRequestClose={() => setCashModal(null)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>
              {cashModal === "cash_in" ? "Cash In (add to drawer)" : "Cash Out (expense / remove)"}
            </Text>
            <Text style={styles.paymentLabel}>Amount</Text>
            <TextInput style={styles.paymentInput} value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad" placeholder="0.00" />
            <Text style={styles.paymentLabel}>Note</Text>
            <TextInput
              style={styles.noteInput}
              value={cashNote}
              onChangeText={setCashNote}
              placeholder={cashModal === "cash_in" ? "e.g. Owner added float" : "e.g. Bought cleaning supplies"}
              multiline
            />
            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => setCashModal(null)}>
                <Text style={styles.paymentCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.paymentConfirmButton} onPress={confirmCashMovement} disabled={savingCash}>
                <Text style={styles.paymentConfirmText}>{savingCash ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#F1F5F9" },
  productsPanel: { flex: 2.5, borderRightWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  cartPanel: { flex: 1, backgroundColor: "#fff" },
  searchContainer: { flexDirection: "row", padding: 15, gap: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#fff" },
  searchInput: { flex: 1, backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  scanButton: { backgroundColor: "#0F172A", borderRadius: 8, paddingHorizontal: 20, justifyContent: "center" },
  scanButtonText: { color: "#fff", fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  gridContainer: { padding: 15, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  productCard: { width: "31%", aspectRatio: 1, backgroundColor: "#fff", borderRadius: 12, padding: 12, justifyContent: "space-between", borderWidth: 1, borderColor: "#E2E8F0" },
  outOfStockCard: { opacity: 0.6 },
  productIconContainer: { alignItems: "center", marginBottom: 8 },
  productIcon: { fontSize: 32 },
  productName: { fontSize: 15, fontWeight: "600", color: "#0F172A", textAlign: "center" },
  productPrice: { fontSize: 16, fontWeight: "bold", color: "#43A047", textAlign: "center", marginTop: 4 },
  outOfStockText: { fontSize: 11, color: "#EF4444", textAlign: "center", fontWeight: "bold", marginTop: 2 },
  listContainer: { padding: 15 },
  listCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", paddingHorizontal: 15, paddingVertical: 12, marginBottom: 10 },
  listIcon: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center", marginRight: 12 },
  listName: { fontSize: 16, fontWeight: "600", color: "#0F172A" },
  listMeta: { fontSize: 13, color: "#64748B", marginTop: 2 },
  listPrice: { fontSize: 16, fontWeight: "bold", color: "#43A047" },
  cartHeader: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cartTitle: { fontSize: 18, fontWeight: "bold", color: "#0F172A" },
  voidAllText: { color: "#EF4444", fontWeight: "bold", fontSize: 15 },
  cashRow: { flexDirection: "row", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  cashInButton: { flex: 1, backgroundColor: "#DCFCE7", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  cashInText: { color: "#166534", fontWeight: "bold" },
  cashOutButton: { flex: 1, backgroundColor: "#FEE2E2", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  cashOutText: { color: "#DC2626", fontWeight: "bold" },
  cartList: { flex: 1, padding: 15 },
  emptyCart: { alignItems: "center", marginTop: 40 },
  emptyCartIcon: { fontSize: 48, marginBottom: 10, opacity: 0.3 },
  emptyCartText: { color: "#94A3B8", fontSize: 16 },
  cartItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  cartItemName: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  cartItemMods: { fontSize: 12, color: "#43A047", marginTop: 2 },
  cartItemPrice: { color: "#64748B", marginTop: 4 },
  quantityControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: { backgroundColor: "#F1F5F9", width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  qtyBtnText: { fontSize: 18, fontWeight: "bold", color: "#0F172A" },
  qtyText: { fontSize: 16, fontWeight: "bold", minWidth: 20, textAlign: "center" },
  voidButton: { marginLeft: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center" },
  voidButtonText: { color: "#EF4444", fontWeight: "bold", fontSize: 14 },
  cartFooter: { padding: 15, borderTopWidth: 1, borderTopColor: "#E2E8F0", backgroundColor: "#fff" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  totalsLabel: { color: "#64748B", fontSize: 15 },
  totalsValue: { color: "#0F172A", fontSize: 15, fontWeight: "500" },
  totalRow: { marginTop: 10, marginBottom: 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  bold: { fontWeight: "bold", fontSize: 20, color: "#0F172A" },
  payButton: { backgroundColor: "#43A047", padding: 18, borderRadius: 12, alignItems: "center" },
  payButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  paymentOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  paymentCard: { width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  paymentTitle: { fontSize: 24, fontWeight: "bold", color: "#0F172A", marginBottom: 10 },
  paymentTotal: { fontSize: 28, fontWeight: "bold", color: "#43A047", marginBottom: 24 },
  paymentMethodRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  paymentMethodButton: { flex: 1, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  paymentMethodActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  paymentMethodText: { color: "#64748B", fontWeight: "bold", fontSize: 15 },
  paymentMethodTextActive: { color: "#fff" },
  paymentLabel: { fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 8 },
  paymentInput: { borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, backgroundColor: "#F8FAFC", marginBottom: 12, textAlign: "center", fontWeight: "bold" },
  paymentChange: { fontSize: 18, fontWeight: "bold", color: "#0F172A", marginBottom: 24, textAlign: "center" },
  paymentButtonRow: { flexDirection: "row", gap: 12 },
  paymentCancelButton: { flex: 1, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  paymentCancelText: { color: "#64748B", fontWeight: "bold", fontSize: 16 },
  paymentConfirmButton: { flex: 1, backgroundColor: "#43A047", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  paymentConfirmDisabled: { opacity: 0.5 },
  paymentConfirmText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  discountValue: { color: "#DC2626", fontWeight: "bold" },
  noteInput: { borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: "#F8FAFC", marginBottom: 20, minHeight: 70, textAlignVertical: "top" },
});