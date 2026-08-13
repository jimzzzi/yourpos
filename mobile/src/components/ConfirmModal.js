import React from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { getPalette } from "../theme";

export default function ConfirmModal({ visible, title, message, confirmText, onConfirm, onCancel }) {
  const { settings } = useSettings();
  const p = getPalette(settings.darkMode);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: p.surface }]}>
          <Text style={[styles.title, { color: p.text }]}>{title}</Text>
          <Text style={[styles.message, { color: p.muted }]}>{message}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: p.border }]} onPress={onCancel}>
              <Text style={{ color: p.muted, fontWeight: "bold" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{confirmText || "Confirm"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 400, borderRadius: 16, padding: 24 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  message: { fontSize: 15, lineHeight: 22, marginBottom: 22 },
  row: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmBtn: { flex: 1, backgroundColor: "#EF4444", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
});