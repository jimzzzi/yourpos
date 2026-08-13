import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, Modal } from "react-native";
import { inventoryApi } from "../api/inventory";
import { api } from "../api/client";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { getPalette } from "../theme";
import ProductFormModal from "../components/ProductFormModal";

function makeStyles(p) {
  return {
    container: { flex: 1, backgroundColor: p.bg },
    topBar: { flexDirection: "row", gap: 10, padding: 14, backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.border, alignItems: "center" },
    searchInput: { flex: 1, backgroundColor: p.input, borderWidth: 1, borderColor: p.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: p.text },
    addButton: { backgroundColor: p.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    addButtonText: { color: "#fff", fontWeight: "bold" },
    catBar: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.border, flexGrow: 0, height: 62 },
    catChip: { borderWidth: 1, borderColor: p.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, backgroundColor: p.surface2 },
    catChipActive: { backgroundColor: p.accent, borderColor: p.accent },
    catChipText: { color: p.muted, fontWeight: "600", fontSize: 13 },
    catChipTextActive: { color: "#fff" },
    list: { padding: 14, width: "100%", maxWidth: 900, alignSelf: "center" },
    card: { flexDirection: "row", backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, padding: 14, marginBottom: 10 },
    thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: p.surface2, justifyContent: "center", alignItems: "center", marginRight: 12 },
    thumbImage: { width: 52, height: 52, borderRadius: 10 },
    info: { flex: 1 },
    name: { fontSize: 16, fontWeight: "bold", color: p.text },
    desc: { fontSize: 12, color: p.muted, marginTop: 2 },
    meta: { fontSize: 12, color: p.muted, marginTop: 4 },
    actions: { justifyContent: "center", gap: 8 },
    editBtn: { backgroundColor: "#0EA5E9", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    delBtn: { backgroundColor: p.dangerBg, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    actionText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
    delText: { color: p.dangerText, fontWeight: "bold", fontSize: 12 },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    empty: { color: p.muted, textAlign: "center", marginTop: 40 },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
    catCard: { width: "100%", maxWidth: 420, backgroundColor: p.surface, borderRadius: 16, padding: 20 },
    catTitle: { fontSize: 20, fontWeight: "bold", color: p.text, marginBottom: 14 },
    catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.border },
    catName: { flex: 1, color: p.text, fontWeight: "600" },
    inputRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    input: { flex: 1, backgroundColor: p.input, borderWidth: 1, borderColor: p.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: p.text },
  };
}

export default function InventoryScreen() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const p = getPalette(settings.darkMode);
  const styles = makeStyles(p);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await inventoryApi.getCategories());
    } catch (e) {}
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setProducts(await inventoryApi.getProducts());
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, [loadCategories, loadProducts]);

  const filtered = products.filter(
    (pr) =>
      pr.name.toLowerCase().includes(search.toLowerCase()) &&
      (selectedCategory == null || pr.category_id === selectedCategory)
  );

  const openCreate = () => {
    setEditing(null);
    setFormVisible(true);
  };

  const openEdit = (pr) => {
    setEditing(pr);
    setFormVisible(true);
  };

  const handleDelete = (pr) => {
    if (!window.confirm(t("delete") + " " + pr.name + "?")) return;
    (async () => {
      try {
        await api.delete("/inventory/products/" + pr.id);
        window.alert("✅ " + t("delete"));
        await loadProducts();
      } catch (e) {
        window.alert("Error");
      }
    })();
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      await inventoryApi.createCategory({ name });
      setNewCatName("");
      await loadCategories();
    } catch (e) {
      window.alert("Error");
    }
  };

  const renderProduct = ({ item }) => {
    const totalStock = (item.variants || []).reduce((s, v) => s + Number(v.stock_quantity || 0), 0);
    const minPrice = (item.variants || []).length ? Math.min(...item.variants.map((v) => Number(v.price || 0))) : 0;
    const cat = categories.find((c) => c.id === item.category_id);
    const sym = settings.currencySymbol || "$";
    const dec = Number.isInteger(Number(settings.decimals)) ? Number(settings.decimals) : 2;
    return (
      <View style={styles.card}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <View style={styles.thumb}><Text style={{ fontSize: 24 }}>📦</Text></View>
        )}
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
          <Text style={styles.meta}>
            {cat ? cat.name : t("noCategory")} • {(item.variants || []).length} {t("variants")} • {t("stock")} {totalStock} • {sym}{minPrice.toFixed(dec)}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
            <Text style={styles.actionText}>{t("edit")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(item)}>
            <Text style={styles.delText}>{t("delete")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder={t("searchItems")} placeholderTextColor={p.muted} />
        <TouchableOpacity style={styles.addButton} onPress={() => setCatModalVisible(true)}>
          <Text style={styles.addButtonText}>🗂</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Text style={styles.addButtonText}>{t("addProduct")}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar} contentContainerStyle={{ alignItems: "center" }}>
        <TouchableOpacity
          style={[styles.catChip, selectedCategory == null && styles.catChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.catChipText, selectedCategory == null && styles.catChipTextActive]}>{t("all")}</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.catChip, selectedCategory === c.id && styles.catChipActive]}
            onPress={() => setSelectedCategory(c.id)}
          >
            <Text style={[styles.catChipText, selectedCategory === c.id && styles.catChipTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={p.accent} /></View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderProduct}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>📦 {t("items")}</Text>}
        />
      )}

      <ProductFormModal
        visible={formVisible}
        product={editing}
        categories={categories}
        onClose={() => setFormVisible(false)}
        onSaved={() => {
          setFormVisible(false);
          loadProducts();
          loadCategories();
        }}
        onCategoryCreated={() => loadCategories()}
      />

      <Modal visible={catModalVisible} transparent animationType="fade" onRequestClose={() => setCatModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.catCard}>
            <Text style={styles.catTitle}>🗂 {t("category")}</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {categories.map((c) => (
                <View key={c.id} style={styles.catRow}>
                  <Text style={styles.catName}>{c.name}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput style={styles.input} value={newCatName} onChangeText={setNewCatName} placeholder={t("categoryName")} placeholderTextColor={p.muted} />
              <TouchableOpacity style={styles.addButton} onPress={addCategory}>
                <Text style={styles.addButtonText}>{t("add")}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.addButton, { marginTop: 14, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border }]} onPress={() => setCatModalVisible(false)}>
              <Text style={{ color: p.text, fontWeight: "bold", textAlign: "center" }}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}