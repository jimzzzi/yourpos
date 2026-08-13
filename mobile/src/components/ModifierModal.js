import React, { useState, useEffect } from "react";
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

export default function ModifierModal({ visible, product, modifiers, onClose, onConfirm }) {
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (visible) setSelectedIds([]);
  }, [visible, product]);

  const applicable = (modifiers || []).filter(
    (m) =>
      (m.category_ids || []).length === 0 ||
      (product && product.category_id != null && (m.category_ids || []).includes(product.category_id))
  );

  const toggle = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selected = applicable.filter((m) => selectedIds.includes(m.id));
  const extra = selected.reduce((s, m) => s + Number(m.price || 0), 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{product ? product.name : ""}</Text>
          <Text style={styles.subtitle}>Add modifiers (taste / extras)</Text>

          <ScrollView style={styles.list}>
            {applicable.length === 0 ? (
              <Text style={styles.empty}>No modifiers available for this item.</Text>
            ) : (
              applicable.map((m) => {
                const active = selectedIds.includes(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => toggle(m.id)}
                  >
                    <Text style={[styles.rowName, active && styles.rowNameActive]}>
                      {active ? "☑ " : "☐ "}{m.name}
                    </Text>
                    <Text style={styles.rowPrice}>+${Number(m.price || 0).toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <Text style={styles.extraText}>Extra: ${extra.toFixed(2)}</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(selected)}>
              <Text style={styles.confirmText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, maxHeight: "75%", backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A" },
  subtitle: { color: "#64748B", marginBottom: 14 },
  list: { marginBottom: 12, maxHeight: 300 },
  empty: { color: "#94A3B8", textAlign: "center", paddingVertical: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  rowName: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  rowNameActive: { color: "#fff" },
  rowPrice: { fontWeight: "bold", color: "#43A047" },
  extraText: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 14 },
  buttonRow: { flexDirection: "row", gap: 12 },
  cancelButton: { flex: 1, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelText: { color: "#64748B", fontWeight: "bold" },
  confirmButton: { flex: 1, backgroundColor: "#43A047", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "bold" },
});
