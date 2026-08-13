import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView, ActivityIndicator } from "react-native";
import { backofficeApi } from "../api/backoffice";
import { inventoryApi } from "../api/inventory";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import ConfirmModal from "../components/ConfirmModal";

export default function ModifiersScreen() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const sym = settings.currencySymbol || "$";
  const dec = Number.isInteger(Number(settings.decimals)) ? Number(settings.decimals) : 2;

  const [modifiers, setModifiers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [selectedCats, setSelectedCats] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await inventoryApi.getCategories());
    } catch (error) {}
  }, []);

  const loadModifiers = useCallback(async () => {
    try {
      setLoading(true);
      setModifiers(await backofficeApi.getModifiers());
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed to load modifiers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    loadModifiers();
  }, [loadCategories, loadModifiers]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPrice("");
    setSelectedCats([]);
    setFormVisible(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setName(m.name);
    setPrice(String(m.price));
    setSelectedCats(m.category_ids || []);
    setFormVisible(true);
  };

  const toggleCat = (id) => {
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    const priceNum = Number(price);
    if (!trimmed) return Alert.alert("Error", t("modifierName") + "!");
    if (Number.isNaN(priceNum) || priceNum < 0) return Alert.alert("Error", t("price") + "!");
    try {
      setSaving(true);
      const payload = { name: trimmed, price: priceNum, category_ids: selectedCats };
      if (editing) await backofficeApi.updateModifier(editing.id, payload);
      else await backofficeApi.createModifier(payload);
      setFormVisible(false);
      await loadModifiers();
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed to save modifier.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await backofficeApi.deleteModifier(deleteTarget.id);
      setDeleteTarget(null);
      await loadModifiers();
    } catch (error) {
      setDeleteTarget(null);
      Alert.alert("Error", "Failed to delete modifier.");
    }
  };

  const renderModifier = ({ item }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardMeta}>+{sym}{Number(item.price || 0).toFixed(dec)}</Text>
        <Text style={styles.cardMeta}>
          {t("category")}: {(item.category_ids || []).length === 0 ? t("all") : (item.category_ids || []).length + " " + t("selected")}
        </Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editButton} onPress={() => openEdit(item)}>
          <Text style={styles.actionText}>{t("edit")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => setDeleteTarget(item)}>
          <Text style={styles.actionText}>{t("delete")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>{t("modifiersTitle")}</Text>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Text style={styles.addButtonText}>{t("addModifier")}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#43A047" /></View>
      ) : (
        <FlatList
          data={modifiers}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderModifier}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{t("noModifiers")}</Text>}
        />
      )}

      <Modal visible={formVisible} animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{editing ? t("editModifier") : t("newModifier")}</Text>
            <TouchableOpacity onPress={() => setFormVisible(false)}>
              <Text style={styles.closeText}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.formContent}>
            <Text style={styles.label}>{t("modifierName")}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Extra Cheese" />
            <Text style={styles.label}>{t("extraPrice")} ({sym})</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.50" />
            <Text style={styles.label}>{t("appliesCats")}</Text>
            <View style={styles.catWrap}>
              {categories.map((c) => {
                const active = selectedCats.includes(c.id);
                return (
                  <TouchableOpacity key={c.id} style={[styles.catChip, active && styles.catChipActive]} onPress={() => toggleCat(c.id)}>
                    <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? t("saving") : t("saveModifier")}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        title={t("deleteModifier")}
        message={'"' + (deleteTarget ? deleteTarget.name : "") + '" — ' + t("cannotUndo")}
        confirmText={t("delete")}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  screenTitle: { fontSize: 20, fontWeight: "bold", color: "#0F172A" },
  addButton: { backgroundColor: "#43A047", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  addButtonText: { color: "#fff", fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, width: "100%", maxWidth: 800, alignSelf: "center" },
  emptyText: { color: "#94A3B8", textAlign: "center", marginTop: 30 },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 12 },
  cardName: { fontSize: 17, fontWeight: "bold", color: "#0F172A", marginBottom: 4 },
  cardMeta: { color: "#64748B", fontSize: 13, marginBottom: 2 },
  cardActions: { justifyContent: "center", gap: 8 },
  editButton: { backgroundColor: "#0EA5E9", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" },
  deleteButton: { backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  formContainer: { flex: 1, backgroundColor: "#fff" },
  formHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  formTitle: { fontSize: 22, fontWeight: "bold", color: "#0F172A" },
  closeText: { color: "#64748B", fontWeight: "600" },
  formContent: { padding: 20, width: "100%", maxWidth: 700, alignSelf: "center" },
  label: { fontSize: 14, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFC" },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  catChip: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  catChipActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  catChipText: { color: "#334155", fontWeight: "600" },
  catChipTextActive: { color: "#fff" },
  saveButton: { backgroundColor: "#43A047", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 24, marginBottom: 30 },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});