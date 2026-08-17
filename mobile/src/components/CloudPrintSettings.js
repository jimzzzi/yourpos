import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Modal, Switch, Alert, ActivityIndicator } from "react-native";
import { api } from "../api/client";
import { backofficeApi } from "../api/backoffice";

export default function CloudPrintSettings() {
  const [printers, setPrinters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);

  const load = async () => {
    try {
      const store = await backofficeApi.getStore();
      let st = store.settings || store;
      if (typeof st === "string") { try { st = JSON.parse(st); } catch (e) { st = {}; } }
      setPrinters(st.cloudPrinters || []);
      const cats = await api.get("/categories").then((r) => r.data).catch(() => []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (e) {
      console.error("Cloud printers load error:", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (list) => {
    setSaving(true);
    try {
      const store = await backofficeApi.getStore();
      let st = store.settings || store;
      if (typeof st === "string") { try { st = JSON.parse(st); } catch (e) { st = {}; } }
      await backofficeApi.updateStoreSettings({ ...st, cloudPrinters: list });
      setPrinters(list);
      Alert.alert("✅ Saved", "Printer routing saved! Refresh the POS screen to apply.");
    } catch (e) {
      Alert.alert("❌", (e.response && e.response.data && e.response.data.error) || e.message);
    }
    setSaving(false);
  };

  const openAdd = () => {
    setForm({ name: "", agentName: "", isReceipt: true, isKitchen: false, allCategories: true, categories: [] });
    setEditOpen(true);
  };

  const openEdit = (p) => {
    setForm({
      id: p.id,
      name: p.name,
      agentName: p.agentName,
      isReceipt: (p.roles || []).includes("receipt"),
      isKitchen: (p.roles || []).includes("kitchen"),
      allCategories: !p.categories || p.categories.length === 0 || p.categories.includes("all"),
      categories: (p.categories || []).filter((c) => c !== "all"),
    });
    setEditOpen(true);
  };

  const saveForm = () => {
    if (!form.name.trim() || !form.agentName.trim()) {
      Alert.alert("⚠️", "Name and Agent Name are required.");
      return;
    }
    const roles = [];
    if (form.isReceipt) roles.push("receipt");
    if (form.isKitchen) roles.push("kitchen");
    if (roles.length === 0) { Alert.alert("⚠️", "Select at least one role (Receipt or Kitchen)."); return; }
    const entry = {
      id: form.id || "cp" + Date.now(),
      name: form.name.trim(),
      agentName: form.agentName.trim(),
      roles,
      categories: form.isKitchen && !form.allCategories ? form.categories : form.isKitchen ? ["all"] : [],
    };
    const list = form.id ? printers.map((p) => (p.id === form.id ? entry : p)) : [...printers, entry];
    setEditOpen(false);
    save(list);
  };

  const remove = (p) => {
    Alert.alert("️ Delete", "Remove '" + p.name + "'?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: () => save(printers.filter((x) => x.id !== p.id)) },
    ]);
  };

  const testPrint = async (p) => {
    try {
      await api.post("/print/jobs", {
        printer_name: p.agentName,
        content: "=== TEST PRINT ===\n" + p.name + "\nRouting works!\n==================",
      });
      Alert.alert("📨 Sent", "Test job sent to agent '" + p.agentName + "'. Watch that printer!");
    } catch (e) {
      Alert.alert("❌", e.message);
    }
  };

  const toggleCat = (id) => {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(id) ? f.categories.filter((c) => c !== id) : [...f.categories, id],
    }));
  };

  if (loading) return <View style={st.center}><ActivityIndicator color="#43A047" /></View>;

  return (
    <View style={st.card}>
      <View style={st.headRow}>
        <Text style={st.title}>☁️ Cloud Printers (Agent Routing)</Text>
        <TouchableOpacity style={st.addBtn} onPress={openAdd}><Text style={st.addBtnText}>+ Add Printer</Text></TouchableOpacity>
      </View>
      <Text style={st.hint}>
        Assign each printer to an Agent. Run the Print Agent setup on each PC and use the SAME Agent Name here.
      </Text>

      {printers.length === 0 ? (
        <Text style={st.empty}>No cloud printers yet. Click "+ Add Printer".</Text>
      ) : (
        printers.map((p) => (
          <View key={p.id} style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.rowName}>{p.name}</Text>
              <Text style={st.rowMeta}>
                Agent: <Text style={{ fontWeight: "bold" }}>{p.agentName}</Text>
                {"  •  "}
                {(p.roles || []).includes("receipt") ? "🧾 Receipt " : ""}
                {(p.roles || []).includes("kitchen") ? "🍳 Kitchen" : ""}
              </Text>
              {(p.roles || []).includes("kitchen") ? (
                <Text style={st.rowCats}>
                  {!p.categories || p.categories.length === 0 || p.categories.includes("all")
                    ? "All categories"
                    : "Categories: " + p.categories.map((id) => { const c = categories.find((x) => String(x.id) === String(id)); return c ? c.name : id; }).join(", ")}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity style={st.iconBtn} onPress={() => testPrint(p)}><Text>🧪</Text></TouchableOpacity>
            <TouchableOpacity style={st.iconBtn} onPress={() => openEdit(p)}><Text>✏️</Text></TouchableOpacity>
            <TouchableOpacity style={st.iconBtn} onPress={() => remove(p)}><Text>🗑️</Text></TouchableOpacity>
          </View>
        ))
      )}

      {/* EDIT MODAL */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={st.overlay}>
          <View style={st.modal}>
            <ScrollView>
              <Text style={st.modalTitle}>{form && form.id ? "Edit Printer" : "Add Cloud Printer"}</Text>

              <Text style={st.label}>Display Name</Text>
              <TextInput style={st.input} value={form ? form.name : ""} placeholder="e.g. Cashier Receipt / Kitchen Grill" onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />

              <Text style={st.label}>Agent Name (must match setup on that PC)</Text>
              <TextInput style={st.input} value={form ? form.agentName : ""} placeholder="e.g. cashier / kitchen1" autoCapitalize="none" onChangeText={(v) => setForm((f) => ({ ...f, agentName: v }))} />

              <View style={st.switchRow}>
                <Text style={st.switchLabel}>🧾 Print Receipts</Text>
                <Switch value={form ? form.isReceipt : false} onValueChange={(v) => setForm((f) => ({ ...f, isReceipt: v }))} />
              </View>
              <View style={st.switchRow}>
                <Text style={st.switchLabel}>🍳 Kitchen Tickets</Text>
                <Switch value={form ? form.isKitchen : false} onValueChange={(v) => setForm((f) => ({ ...f, isKitchen: v }))} />
              </View>

              {form && form.isKitchen ? (
                <View>
                  <View style={st.switchRow}>
                    <Text style={st.switchLabel}>All Categories</Text>
                    <Switch value={form.allCategories} onValueChange={(v) => setForm((f) => ({ ...f, allCategories: v }))} />
                  </View>
                  {!form.allCategories ? (
                    <View style={st.catWrap}>
                      {categories.map((c) => {
                        const active = form.categories.includes(String(c.id));
                        return (
                          <TouchableOpacity key={c.id} style={[st.catChip, active && st.catChipActive]} onPress={() => toggleCat(String(c.id))}>
                            <Text style={[st.catChipText, active && st.catChipTextActive]}>{c.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={st.modalBtns}>
                <TouchableOpacity style={st.cancelBtn} onPress={() => setEditOpen(false)}><Text style={{ color: "#475569", fontWeight: "bold" }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={st.saveBtn} onPress={saveForm} disabled={saving}><Text style={{ color: "#fff", fontWeight: "bold" }}>{saving ? "Saving…" : "💾 Save"}</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 16, fontWeight: "bold", color: "#0F172A" },
  addBtn: { backgroundColor: "#43A047", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  hint: { color: "#94A3B8", fontSize: 12, marginBottom: 12, lineHeight: 17 },
  empty: { color: "#94A3B8", textAlign: "center", paddingVertical: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 8 },
  rowName: { fontSize: 15, fontWeight: "bold", color: "#0F172A" },
  rowMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  rowCats: { fontSize: 11, color: "#43A047", marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center" },
  center: { paddingVertical: 40, alignItems: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: "#fff", borderRadius: 16, padding: 20, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#0F172A", marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 6 },
  switchLabel: { fontSize: 14, fontWeight: "600", color: "#334155" },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  catChip: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  catChipActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  catChipText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  catChipTextActive: { color: "#fff" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveBtn: { flex: 1, backgroundColor: "#43A047", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
});