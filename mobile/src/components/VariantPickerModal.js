import React from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { getPalette } from "../theme";

export default function VariantPickerModal({ product, visible, onClose, onSelectVariant }) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const p = getPalette(settings.darkMode);
  const variants = (product && product.variants) || [];
  const sym = settings.currencySymbol || "$";
  const dec = Number.isInteger(Number(settings.decimals)) ? Number(settings.decimals) : 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: p.surface }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: p.text }]}>{product ? product.name : ""}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: p.muted, fontWeight: "600" }}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {variants.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.variantRow, { borderColor: p.border, backgroundColor: p.surface2 }]}
                onPress={() => onSelectVariant(product, v)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.variantName, { color: p.text }]}>{v.name || "Default"}</Text>
                  <Text style={{ color: v.stock_quantity <= 0 ? p.dangerText : p.muted, fontSize: 12, marginTop: 2 }}>
                    {v.stock_quantity <= 0 ? t("outOfStock") : t("stock") + ": " + v.stock_quantity}
                  </Text>
                </View>
                <Text style={[styles.variantPrice, { color: p.accent }]}>{sym}{Number(v.price || 0).toFixed(dec)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 20, maxHeight: "70%" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontSize: 20, fontWeight: "bold" },
  variantRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10 },
  variantName: { fontSize: 16, fontWeight: "600" },
  variantPrice: { fontSize: 16, fontWeight: "bold" },
});