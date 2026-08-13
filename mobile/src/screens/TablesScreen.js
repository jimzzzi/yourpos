import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { backofficeApi } from "../api/backoffice";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { getPalette } from "../theme";

function makeStyles(p) {
  return {
    container: { flex: 1, backgroundColor: p.bg },
    topBar: { flexDirection: "row", gap: 10, padding: 16, backgroundColor: p.surface, borderBottomWidth: 1, borderBottomColor: p.border },
    input: { flex: 1, backgroundColor: p.input, borderWidth: 1, borderColor: p.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: p.text },
    addButton: { backgroundColor: p.accent, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
    addButtonText: { color: "#fff", fontWeight: "bold" },
    list: { padding: 16, width: "100%", maxWidth: 800, alignSelf: "center" },
    row: { flexDirection: "row", alignItems: "center", backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 },
    rowName: { flex: 1, fontSize: 17, fontWeight: "bold", color: p.text },
    statusFree: { color: p.successText, fontWeight: "bold", fontSize: 13 },
    statusBusy: { color: p.dangerText, fontWeight: "bold", fontSize: 13 },
    deleteButton: { backgroundColor: p.dangerBg, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 12 },
    deleteText: { color: p.dangerText, fontWeight: "bold", fontSize: 13 },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    empty: { color: p.muted, textAlign: "center", marginTop: 30 },
  };
}

export default function TablesScreen() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const p = getPalette(settings.darkMode);
  const styles = makeStyles(p);

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setTables(await backofficeApi.getTables());
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addTable = async () => {
    let trimmed = name.trim();
    if (!trimmed) {
      const prompted = window.prompt(t("tableNamePh"), "Table " + (tables.length + 1));
      trimmed = String(prompted || "").trim();
    }
    if (!trimmed) return;
    try {
      setSaving(true);
      await backofficeApi.createTable(trimmed);
      window.alert(" " + trimmed + " ✅");
      setName("");
      await load();
    } catch (error) {
      window.alert("Failed: " + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const removeTable = (tb) => {
  if (!window.confirm("Delete " + tb.name + "?")) return;
  (async () => {
    try {
      await backofficeApi.deleteTable(tb.id);
      await load();
    } catch (error) {
      window.alert("Failed to delete table.");
    }
  })();
};

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t("tableNamePh")} placeholderTextColor={p.muted} />
        <TouchableOpacity style={styles.addButton} onPress={addTable} disabled={saving}>
          <Text style={styles.addButtonText}>{saving ? "..." : t("addTable")}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={p.accent} /></View>
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t("noTables")}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowName}>🪑 {item.name}</Text>
              {item.open_order ? (
                <Text style={styles.statusBusy}>{t("occupied")}</Text>
              ) : (
                <Text style={styles.statusFree}>{t("freeTable")}</Text>
              )}
              <TouchableOpacity style={styles.deleteButton} onPress={() => removeTable(item)}>
                <Text style={styles.deleteText}>{t("delete")}</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}