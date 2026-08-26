import React, { useState, useEffect } from "react";
import {
  View, Text, Modal, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from "react-native";
import { inventoryApi } from "../api/inventory";
import { api } from "../api/client";
import { useI18n } from "../i18n/I18nContext";

const emptyVariant = { id: null, name: "", price: "", stock_quantity: "", sku: "", barcode: "" };

export default function ProductFormModal({ visible, product, categories, onClose, onSaved, onCategoryCreated }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [isTimeBased, setIsTimeBased] = useState(false);
  const [timeUnitMinutes, setTimeUnitMinutes] = useState("");
  
  // ⚖️ NEW: Weight-based state
  const [soldByWeight, setSoldByWeight] = useState(false);
  
  const [variants, setVariants] = useState([{ ...emptyVariant }]);
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError("");
    setNewCategoryMode(false);
    setNewCategoryName("");
    if (product) {
      setName(product.name || "");
      setCategoryId(product.category_id || null);
      setImageUrl(product.image_url || "");
      setDescription(product.description || "");
      setTrackStock(Boolean(product.track_stock));
      setIsTimeBased(Boolean(product.is_time_based));
      setTimeUnitMinutes(product.time_unit_minutes ? String(product.time_unit_minutes) : "");
      
      // ⚖️ Load weight-based setting
      setSoldByWeight(Boolean(product.sold_by_weight));
      
      const existing = (product.variants || []).map((v) => ({
        id: v.id,
        name: v.name === "Default" ? "" : v.name || "",
        price: String(v.price ?? ""),
        stock_quantity: String(v.stock_quantity ?? ""),
        sku: v.sku || "",
        barcode: v.barcode || "",
      }));
      setVariants(existing.length > 0 ? existing : [{ ...emptyVariant }]);
    } else {
      setName("");
      setCategoryId(null);
      setImageUrl("");
      setDescription("");
      setTrackStock(false);
      setIsTimeBased(false);
      setTimeUnitMinutes("");
      setSoldByWeight(false);
      setVariants([{ ...emptyVariant }]);
    }
  }, [visible, product]);

  const updateVariant = (index, field, value) => {
    setVariants((prev) => prev.map((variant, i) => (i === index ? { ...variant, [field]: value } : variant)));
  };

  const addVariant = () => setVariants((prev) => [...prev, { ...emptyVariant }]);

  const removeVariant = (index) => {
    setVariants((prev) => {
      if (prev.length <= 1) return [{ ...emptyVariant }];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleUpload = () => {
    if (Platform.OS !== "web") {
      Alert.alert(t("upload"), t("imageUrl"));
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      
      try {
        setUploading(true);
        const formData = new FormData();
        formData.append("image", file);
        
        const response = await api.post("/upload/image", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        
        setImageUrl(response.data.url);
      } catch (err) {
        Alert.alert("❌ Upload Failed", err.response?.data?.error || err.message || "Could not upload image.");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleAutoImage = async () => {
    const term = (name || "").trim();
    if (!term) {
      Alert.alert(t("autoPhoto"), t("productName") + "?");
      return;
    }
    try {
      const tryMeal = async (q) => {
        const r = await fetch("https://www.themealdb.com/api/json/v1/1/search.php?s=" + encodeURIComponent(q));
        const data = await r.json();
        return data && data.meals && data.meals[0] ? data.meals[0].strMealThumb : null;
      };
      let thumb = await tryMeal(term);
      if (!thumb && term.includes(" ")) thumb = await tryMeal(term.split(" ").pop());
      if (thumb) {
        setImageUrl(thumb);
        return;
      }
      const url =
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=" +
        encodeURIComponent(term + " food dish") +
        "&gsrlimit=1&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=256";
      const r = await fetch(url);
      const data = await r.json();
      const pages = data.query && data.query.pages;
      if (!pages) throw new Error("none");
      const page = Object.values(pages)[0];
      const wiki = page.imageinfo && page.imageinfo[0] && (page.imageinfo[0].thumburl || page.imageinfo[0].url);
      if (!wiki) throw new Error("none");
      setImageUrl(wiki);
    } catch (e) {
      Alert.alert(t("autoPhoto"), "No image found for '" + term + "'.");
    }
  };

  const handleCreateCategory = async () => {
    const categoryName = newCategoryName.trim();
    if (!categoryName) {
      setError(t("categoryName") + "!");
      return;
    }
    try {
      const created = await inventoryApi.createCategory({ name: categoryName });
      setCategoryId(created.id);
      setNewCategoryMode(false);
      setNewCategoryName("");
      if (onCategoryCreated) onCategoryCreated(created);
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Failed to create category.");
    }
  };

  const validate = () => {
    if (!name.trim()) {
      setError(t("productName") + "!");
      return false;
    }
    if (variants.length === 0) {
      setError(t("variants") + "!");
      return false;
    }
    for (const variant of variants) {
      const price = Number(variant.price);
      if (Number.isNaN(price) || price < 0) {
        setError(t("price") + "!");
        return false;
      }
      const stock = Number(variant.stock_quantity || 0);
      if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        setError(t("stock") + "!");
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    setError("");
    if (!validate()) return;
    const payload = {
      name: name.trim(),
      category_id: categoryId,
      image_url: imageUrl.trim(),
      description: description.trim(),
      track_stock: trackStock,
      is_time_based: isTimeBased,
      time_unit_minutes: isTimeBased && timeUnitMinutes ? Number(timeUnitMinutes) : null,
      sold_by_weight: soldByWeight,
      variants: variants.map((variant) => ({
        id: variant.id || undefined,
        name: variant.name.trim() || "Default",
        price: Number(variant.price),
        stock_quantity: Number(variant.stock_quantity || 0),
        sku: variant.sku.trim(),
        barcode: variant.barcode.trim(),
      })),
    };
    try {
      setSaving(true);
      if (product) {
        await inventoryApi.updateProduct(product.id, payload);
      } else {
        await inventoryApi.createProduct(payload);
      }
      onSaved();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.error || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{product ? t("editProduct") : t("createProduct")}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>{t("close")}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>{t("productName")}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Burger" />

            <Text style={styles.label}>{t("description")}</Text>
            <TextInput
              style={[styles.input, styles.descInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Freshly baked sourdough loaf"
              multiline
            />

            <Text style={styles.label}>{t("stock")}</Text>
            <View style={styles.categoryRow}>
              <TouchableOpacity style={[styles.categoryChip, trackStock && styles.categoryChipActive]} onPress={() => setTrackStock(true)}>
                <Text style={[styles.categoryChipText, trackStock && styles.categoryChipTextActive]}>{t("trackStock")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.categoryChip, !trackStock && styles.categoryChipActive]} onPress={() => setTrackStock(false)}>
                <Text style={[styles.categoryChipText, !trackStock && styles.categoryChipTextActive]}>{t("alwaysSellable")}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hintText}>{trackStock ? t("stockHintOn") : t("stockHintOff")}</Text>

            <Text style={styles.label}>⏱ Time-Based Billing</Text>
            <View style={styles.categoryRow}>
              <TouchableOpacity style={[styles.categoryChip, isTimeBased && styles.categoryChipActive]} onPress={() => setIsTimeBased(true)}>
                <Text style={[styles.categoryChipText, isTimeBased && styles.categoryChipTextActive]}>⏱ Time-Based</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.categoryChip, !isTimeBased && styles.categoryChipActive]} onPress={() => setIsTimeBased(false)}>
                <Text style={[styles.categoryChipText, !isTimeBased && styles.categoryChipTextActive]}>Regular Item</Text>
              </TouchableOpacity>
            </View>
            {isTimeBased ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.smallLabel}>Time unit (minutes)</Text>
                <TextInput style={styles.input} value={timeUnitMinutes} onChangeText={setTimeUnitMinutes} keyboardType="number-pad" placeholder="60" />
                <Text style={styles.hintText}>e.g. 60 = charge price every 60 minutes</Text>
              </View>
            ) : null}

            {/* ⚖️ NEW: Sold by Weight Section */}
            <Text style={styles.label}>⚖️ Weight-Based Item</Text>
            <View style={styles.categoryRow}>
              <TouchableOpacity style={[styles.categoryChip, soldByWeight && styles.categoryChipActive]} onPress={() => setSoldByWeight(true)}>
                <Text style={[styles.categoryChipText, soldByWeight && styles.categoryChipTextActive]}>⚖️ By Weight</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.categoryChip, !soldByWeight && styles.categoryChipActive]} onPress={() => setSoldByWeight(false)}>
                <Text style={[styles.categoryChipText, !soldByWeight && styles.categoryChipTextActive]}>Per Item</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hintText}>
              {soldByWeight 
                ? "Price is per KG. Cashier will enter weight when selling." 
                : "Regular item — fixed price per piece."}
            </Text>

            <Text style={styles.label}>{t("category")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
              <TouchableOpacity
                style={[styles.categoryChip, categoryId === null && styles.categoryChipActive]}
                onPress={() => setCategoryId(null)}
              >
                <Text style={[styles.categoryChipText, categoryId === null && styles.categoryChipTextActive]}>{t("noCategory")}</Text>
              </TouchableOpacity>
              {(categories || []).map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryChip, categoryId === category.id && styles.categoryChipActive]}
                  onPress={() => setCategoryId(category.id)}
                >
                  <Text style={[styles.categoryChipText, categoryId === category.id && styles.categoryChipTextActive]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.categoryChipNew} onPress={() => setNewCategoryMode((prev) => !prev)}>
                <Text style={styles.categoryChipNewText}>{t("newCategory")}</Text>
              </TouchableOpacity>
            </ScrollView>

            {newCategoryMode ? (
              <View style={styles.newCategoryRow}>
                <TextInput
                  style={[styles.input, styles.flexInput]}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder={t("categoryName")}
                />
                <TouchableOpacity style={styles.newCategorySave} onPress={handleCreateCategory}>
                  <Text style={styles.newCategorySaveText}>{t("add")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.label}>{t("itemPhoto")}</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity 
                style={[styles.uploadButton, { flex: 1, opacity: uploading ? 0.6 : 1 }]} 
                onPress={handleUpload} 
                disabled={uploading}
              >
                <Text style={styles.uploadButtonText}>
                  {uploading ? "Uploading..." : t("upload")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.uploadButton, { flex: 1, backgroundColor: "#2563eb" }]} onPress={handleAutoImage}>
                <Text style={styles.uploadButtonText}>{t("autoPhoto")}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.smallNote}>{t("imageUrl")}</Text>
            <TextInput style={styles.input} value={imageUrl} onChangeText={setImageUrl} placeholder="https://example.com/image.png" />
            {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.imagePreview} resizeMode="cover" /> : null}

            <View style={styles.variantsHeaderRow}>
              <Text style={styles.label}>{t("variants")}</Text>
              <TouchableOpacity onPress={addVariant}>
                <Text style={styles.addVariantText}>{t("addVariant")}</Text>
              </TouchableOpacity>
            </View>

            {variants.map((variant, index) => (
              <View key={index} style={styles.variantCard}>
                <View style={styles.variantTopRow}>
                  <Text style={styles.variantTitle}>{t("variants")} {index + 1}</Text>
                  <TouchableOpacity onPress={() => removeVariant(index)}>
                    <Text style={styles.removeVariantText}>{t("removeVariant")}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={variant.name}
                  onChangeText={(value) => updateVariant(index, "name", value)}
                  placeholder={t("variantName")}
                />
                <View style={styles.variantRow}>
                  <View style={styles.variantHalf}>
                    {/* ⚖️ Dynamic price label based on weight mode */}
                    <Text style={styles.smallLabel}>
                      {soldByWeight ? "💰 Price per KG" : t("price")}
                    </Text>
                    <TextInput style={styles.input} value={variant.price} onChangeText={(value) => updateVariant(index, "price", value)} keyboardType="decimal-pad" placeholder="9.99" />
                  </View>
                  <View style={styles.variantHalf}>
                    <Text style={styles.smallLabel}>{t("stock")}</Text>
                    <TextInput style={styles.input} value={variant.stock_quantity} onChangeText={(value) => updateVariant(index, "stock_quantity", value)} keyboardType="number-pad" placeholder="50" />
                  </View>
                </View>
                <View style={styles.variantRow}>
                  <View style={styles.variantHalf}>
                    <Text style={styles.smallLabel}>{t("sku")}</Text>
                    <TextInput style={styles.input} value={variant.sku} onChangeText={(value) => updateVariant(index, "sku", value)} placeholder="TS-S" />
                  </View>
                  <View style={styles.variantHalf}>
                    <Text style={styles.smallLabel}>{t("barcode")}</Text>
                    <TextInput style={styles.input} value={variant.barcode} onChangeText={(value) => updateVariant(index, "barcode", value)} keyboardType="number-pad" placeholder="123456789" />
                  </View>
                </View>
              </View>
            ))}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{product ? t("updateProduct") : t("createProduct")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  flex: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#0f172a" },
  closeButton: { color: "#64748b", fontWeight: "600" },
  scrollContent: { padding: 20 },
  label: { fontSize: 14, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 14 },
  hintText: { fontSize: 12, color: "#64748b", marginTop: 6 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#f8fafc" },
  descInput: { minHeight: 70, textAlignVertical: "top" },
  uploadButton: { backgroundColor: "#0f172a", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  uploadButtonText: { color: "#fff", fontWeight: "bold" },
  smallNote: { fontSize: 12, color: "#64748b", marginTop: 8, marginBottom: 4 },
  imagePreview: { width: 96, height: 96, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  categoryRow: { flexDirection: "row", marginTop: 4 },
  categoryChip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  categoryChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  categoryChipText: { color: "#334155", fontWeight: "600" },
  categoryChipTextActive: { color: "#fff" },
  categoryChipNew: { borderWidth: 1, borderColor: "#16a34a", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  categoryChipNewText: { color: "#16a34a", fontWeight: "bold" },
  newCategoryRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  flexInput: { flex: 1 },
  newCategorySave: { backgroundColor: "#16a34a", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  newCategorySaveText: { color: "#fff", fontWeight: "bold" },
  variantsHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 },
  addVariantText: { color: "#2563eb", fontWeight: "bold" },
  variantCard: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, marginBottom: 12, backgroundColor: "#f8fafc" },
  variantTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  variantTitle: { fontWeight: "bold", color: "#0f172a" },
  removeVariantText: { color: "#dc2626", fontWeight: "600" },
  variantRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  variantHalf: { flex: 1 },
  smallLabel: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  errorText: { marginTop: 14, color: "#dc2626" },
  saveButton: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20, marginBottom: 30 },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});