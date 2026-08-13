import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { inventoryApi } from "../api/inventory";
import { createOrder } from "../services/orderService";
import { syncOfflineOrders } from "../services/syncService";
import VariantPickerModal from "../components/VariantPickerModal";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import HardwareScannerInput from "../components/HardwareScannerInput";

export default function POSHomeScreen() {
  const { user, store } = useAuth();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState([]);

  const [variantPickerProduct, setVariantPickerProduct] = useState(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [processing, setProcessing] = useState(false);

  const taxRate = Number(store?.tax_rate || 7) / 100;

  const { subtotal, tax, total } = useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const t = sub * taxRate;
    return { subtotal: sub, tax: t, total: sub + t };
  }, [cart, taxRate]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoadingProducts(true);
        const data = await inventoryApi.getProducts();

        const mapped = data.map((product) => {
          const variants = product.variants || [];
          const totalStock = variants.reduce(
            (s, v) => s + Number(v.stock_quantity || 0),
            0
          );
          const minPrice = variants.length
            ? Math.min(...variants.map((v) => Number(v.price || 0)))
            : 0;

          return {
            id: String(product.id),
            product_id: product.id,
            name: product.name,
            image_url: product.image_url,
            variants,
            stock_quantity: totalStock,
            price: minPrice,
          };
        });

        setProducts(mapped);
      } catch (error) {
        console.error("Failed to load products:", error);
      } finally {
        setLoadingProducts(false);
      }
    };

    loadProducts();
  }, []);

  const addToCart = (product, variant) => {
    if (Number(variant.stock_quantity || 0) <= 0) {
      Alert.alert("Out of Stock", product.name + " is out of stock.");
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === String(variant.id));

      if (existingItem) {
        if (existingItem.quantity >= Number(variant.stock_quantity)) {
          Alert.alert("Stock Limit", "Only " + variant.stock_quantity + " available.");
          return prevCart;
        }

        return prevCart.map((item) =>
          item.id === String(variant.id)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      const displayName =
        variant.name && variant.name !== "Default"
          ? product.name + " (" + variant.name + ")"
          : product.name;

      return [
        ...prevCart,
        {
          id: String(variant.id),
          variant_id: variant.id,
          product_id: product.product_id || product.id,
          name: displayName,
          price: Number(variant.price || 0),
          stock_quantity: Number(variant.stock_quantity || 0),
          quantity: 1,
        },
      ];
    });
  };

  const handleProductTap = (product) => {
    const availableVariants = (product.variants || []).filter(
      (v) => Number(v.stock_quantity || 0) > 0
    );

    if (availableVariants.length === 0) {
      Alert.alert("Out of Stock", product.name + " is out of stock.");
      return;
    }

    if (availableVariants.length === 1) {
      addToCart(product, availableVariants[0]);
      return;
    }

    setVariantPickerProduct(product);
  };

  const updateQuantity = (id, change) => {
    setCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + change;

            if (change > 0 && newQty > item.stock_quantity) {
              return item;
            }

            return newQty > 0 ? { ...item, quantity: newQty } : item;
          }
          return item;
        })
        .filter((item) => item.quantity > 0);
    });
  };

  const findProductByBarcode = (code) => {
    for (const product of products) {
      const variant = (product.variants || []).find(
        (v) => v.barcode === code || v.sku === code
      );
      if (variant) return { product, variant };
    }
    return null;
  };

  const handleBarcodeScanned = async (code) => {
    const cleanCode = String(code || "").trim();
    if (!cleanCode) return;

    const localMatch = findProductByBarcode(cleanCode);

    if (localMatch) {
      addToCart(localMatch.product, localMatch.variant);
      return;
    }

    try {
      const data = await inventoryApi.lookupBarcode(cleanCode);

      const productLike = {
        id: String(data.product_id),
        product_id: data.product_id,
        name: data.product_name,
        variants: [data.variant],
      };

      addToCart(productLike, data.variant);
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
    setPaymentModalVisible(true);
  };

  const tenderedValue = Number(amountTendered || 0);
  const changeDue = Math.max(0, tenderedValue - total);
  const canConfirmPayment = paymentMethod === "card" || tenderedValue >= total;

  const handleCheckout = async (payment) => {
    if (cart.length === 0) {
      Alert.alert("Cart is Empty");
      return;
    }

    if (processing) return;

    setProcessing(true);

    try {
      await createOrder({ cart, subtotal, tax, total, user, store, payment });

      const quantityByVariant = {};
      cart.forEach((cartItem) => {
        quantityByVariant[cartItem.variant_id] =
          (quantityByVariant[cartItem.variant_id] || 0) + cartItem.quantity;
      });

      setProducts((prevProducts) =>
        prevProducts.map((product) => {
          const updatedVariants = (product.variants || []).map((variant) => {
            const sold = quantityByVariant[variant.id] || 0;
            if (!sold) return variant;
            return {
              ...variant,
              stock_quantity: Math.max(0, Number(variant.stock_quantity || 0) - sold),
            };
          });

          const totalStock = updatedVariants.reduce(
            (s, v) => s + Number(v.stock_quantity || 0),
            0
          );

          return { ...product, variants: updatedVariants, stock_quantity: totalStock };
        })
      );

      await syncOfflineOrders();

      Alert.alert(
        "Sale Completed",
        "Total charged: $" +
          total.toFixed(2) +
          "\nPayment: " +
          payment.payment_method.toUpperCase()
      );

      setCart([]);
    } catch (error) {
      console.error("Checkout error:", error);
      Alert.alert("Checkout Failed", error.message || "Failed to complete checkout.");
    } finally {
      setProcessing(false);
    }
  };

  const confirmPayment = () => {
    const payment = {
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === "cash" ? tenderedValue : total,
      change_due: paymentMethod === "cash" ? changeDue : 0,
      payments: [{ method: paymentMethod, amount: total }],
    };

    setPaymentModalVisible(false);
    handleCheckout(payment);
  };

  const renderProduct = ({ item }) => (
    <TouchableOpacity
      style={[styles.productCard, item.stock_quantity <= 0 && styles.disabledProductCard]}
      onPress={() => handleProductTap(item)}
      disabled={item.stock_quantity <= 0}
    >
      <Text style={styles.productIcon}>📦</Text>
      <Text style={styles.productName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
      <Text style={styles.productStock}>Stock: {item.stock_quantity}</Text>
    </TouchableOpacity>
  );

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>
          ${(item.price * item.quantity).toFixed(2)}
        </Text>
      </View>
      <View style={styles.quantityControls}>
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, -1)}
          style={styles.qtyBtn}
        >
          <Text style={styles.qtyBtnText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.qtyText}>{item.quantity}</Text>
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, 1)}
          style={styles.qtyBtn}
        >
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <HardwareScannerInput
        onBarcode={handleBarcodeScanned}
        active={!scannerVisible && !paymentModalVisible && !variantPickerProduct}
      />

      <View style={styles.productsPanel}>
        <View style={styles.posTopBar}>
          <Text style={styles.sectionTitle}>Menu Items</Text>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => setScannerVisible(true)}
          >
            <Text style={styles.scanButtonText}>📷 Scan</Text>
          </TouchableOpacity>
        </View>

        {loadingProducts ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={products}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id}
            numColumns={2}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <View style={styles.cartPanel}>
        <Text style={styles.sectionTitle}>Current Order</Text>

        <FlatList
          data={cart}
          renderItem={renderCartItem}
          keyExtractor={(item) => item.id}
          style={styles.cartList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Cart is empty</Text>
          }
        />

        <View style={styles.checkoutArea}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Tax</Text>
            <Text>${tax.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.totalRow]}>
            <Text style={styles.bold}>TOTAL</Text>
            <Text style={styles.bold}>${total.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            style={styles.payButton}
            onPress={openPaymentModal}
            disabled={processing}
          >
            <Text style={styles.payButtonText}>
              {processing ? "Processing..." : "Charge $" + total.toFixed(2)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <VariantPickerModal
        product={variantPickerProduct}
        visible={Boolean(variantPickerProduct)}
        onClose={() => setVariantPickerProduct(null)}
        onSelectVariant={(product, variant) => {
          setVariantPickerProduct(null);
          addToCart(product, variant);
        }}
      />

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleBarcodeScanned}
      />

      <Modal
        visible={paymentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Payment</Text>
            <Text style={styles.paymentTotal}>Total: ${total.toFixed(2)}</Text>

            <View style={styles.paymentMethodRow}>
              <TouchableOpacity
                style={[
                  styles.paymentMethodButton,
                  paymentMethod === "cash" && styles.paymentMethodActive,
                ]}
                onPress={() => setPaymentMethod("cash")}
              >
                <Text
                  style={[
                    styles.paymentMethodText,
                    paymentMethod === "cash" && styles.paymentMethodTextActive,
                  ]}
                >
                  Cash
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentMethodButton,
                  paymentMethod === "card" && styles.paymentMethodActive,
                ]}
                onPress={() => setPaymentMethod("card")}
              >
                <Text
                  style={[
                    styles.paymentMethodText,
                    paymentMethod === "card" && styles.paymentMethodTextActive,
                  ]}
                >
                  Card
                </Text>
              </TouchableOpacity>
            </View>

            {paymentMethod === "cash" ? (
              <>
                <Text style={styles.paymentLabel}>Amount Received</Text>
                <TextInput
                  style={styles.paymentInput}
                  value={amountTendered}
                  onChangeText={setAmountTendered}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.paymentChange}>
                  Change: ${changeDue.toFixed(2)}
                </Text>
              </>
            ) : null}

            <View style={styles.paymentButtonRow}>
              <TouchableOpacity
                style={styles.paymentCancelButton}
                onPress={() => setPaymentModalVisible(false)}
              >
                <Text style={styles.paymentCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentConfirmButton,
                  !canConfirmPayment && styles.paymentConfirmDisabled,
                ]}
                onPress={confirmPayment}
                disabled={!canConfirmPayment}
              >
                <Text style={styles.paymentConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row", backgroundColor: "#f4f6f8" },
  productsPanel: { flex: 2, padding: 15, borderRightWidth: 1, borderColor: "#ddd" },
  cartPanel: { flex: 1, padding: 15, backgroundColor: "#fff" },
  posTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 24, fontWeight: "bold", marginBottom: 5 },
  scanButton: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scanButtonText: { color: "#fff", fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  productCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 15,
    margin: 5,
    borderRadius: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  disabledProductCard: { opacity: 0.5 },
  productIcon: { fontSize: 40, marginBottom: 5 },
  productName: { fontSize: 16, fontWeight: "600" },
  productPrice: { fontSize: 14, color: "#666", marginTop: 5 },
  productStock: { fontSize: 12, color: "#64748b", marginTop: 4 },
  cartList: { flex: 1, marginBottom: 10 },
  emptyText: { textAlign: "center", marginTop: 20, color: "#999" },
  cartItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  cartItemName: { fontSize: 16, fontWeight: "500" },
  cartItemPrice: { color: "#666", marginTop: 2 },
  quantityControls: { flexDirection: "row", alignItems: "center" },
  qtyBtn: {
    backgroundColor: "#e1e8ed",
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnText: { fontSize: 18, fontWeight: "bold" },
  qtyText: { marginHorizontal: 10, fontSize: 16, fontWeight: "bold" },
  checkoutArea: { borderTopWidth: 2, borderColor: "#333", paddingTop: 10 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
    fontSize: 16,
  },
  totalRow: { marginTop: 10, marginBottom: 15 },
  bold: { fontWeight: "bold", fontSize: 18 },
  payButton: {
    backgroundColor: "#4caf50",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  payButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  paymentOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  paymentCard: { width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  paymentTitle: { fontSize: 24, fontWeight: "bold", color: "#0f172a", marginBottom: 10 },
  paymentTotal: { fontSize: 20, fontWeight: "bold", color: "#16a34a", marginBottom: 16 },
  paymentMethodRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  paymentMethodButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  paymentMethodActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  paymentMethodText: { color: "#334155", fontWeight: "bold" },
  paymentMethodTextActive: { color: "#fff" },
  paymentLabel: { fontSize: 14, fontWeight: "600", color: "#334155", marginBottom: 6 },
  paymentInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    backgroundColor: "#f8fafc",
    marginBottom: 10,
  },
  paymentChange: { fontSize: 16, fontWeight: "bold", color: "#0f172a", marginBottom: 16 },
  paymentButtonRow: { flexDirection: "row", gap: 12 },
  paymentCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  paymentCancelText: { color: "#334155", fontWeight: "bold" },
  paymentConfirmButton: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  paymentConfirmDisabled: { opacity: 0.5 },
  paymentConfirmText: { color: "#fff", fontWeight: "bold" },
});
