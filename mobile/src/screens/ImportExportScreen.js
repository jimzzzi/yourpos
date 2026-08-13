import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from "react-native";
import { inventoryApi } from "../api/inventory";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { getPalette } from "../theme";

function esc(v) {
  const s = String(v === null || v === undefined ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function makeStyles(p) {
  return {
    container: { flex: 1, backgroundColor: p.bg },
    content: { padding: 20, width: "100%", maxWidth: 700, alignSelf: "center" },
    title: { fontSize: 22, fontWeight: "bold", color: p.text, marginBottom: 16 },
    card: { backgroundColor: p.surface, borderRadius: 12, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: p.border },
    cardTitle: { fontSize: 16, fontWeight: "bold", color: p.text, marginBottom: 8 },
    hint: { fontSize: 12, color: p.muted, marginTop: 10, lineHeight: 18 },
    buttonRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    button: { flex: 1, backgroundColor: p.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
    buttonSecondary: { flex: 1, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
    buttonText: { color: "#fff", fontWeight: "bold" },
    buttonTextSecondary: { color: p.text, fontWeight: "bold" },
    center: { paddingVertical: 30, alignItems: "center" },
  };
}

export default function ImportExportScreen() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const p = getPalette(settings.darkMode);
  const styles = makeStyles(p);
  const [busy, setBusy] = useState(false);

  const download = (filename, text) => {
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  const exportItems = async () => {
    try {
      setBusy(true);
      const [products, categories] = await Promise.all([inventoryApi.getProducts(), inventoryApi.getCategories()]);
      const catById = {};
      categories.forEach((c) => (catById[c.id] = c.name));
      const lines = ["name,description,category,variant,price,stock,sku,barcode,image_url"];
      products.forEach((prod) => {
        (prod.variants && prod.variants.length ? prod.variants : [null]).forEach((v) => {
          lines.push(
            [
              esc(prod.name),
              esc(prod.description || ""),
              esc(prod.category_id ? catById[prod.category_id] || "" : ""),
              esc(v ? v.name : "Default"),
              v ? Number(v.price || 0) : 0,
              v ? Number(v.stock_quantity || 0) : 0,
              esc(v ? v.sku || "" : ""),
              esc(v ? v.barcode || "" : ""),
              esc(prod.image_url || ""),
            ].join(",")
          );
        });
      });
      download("items.csv", lines.join("\n"));
      Alert.alert("✅", "items.csv");
    } catch (e) {
      Alert.alert("Error", "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const exportCategories = async () => {
    try {
      setBusy(true);
      const categories = await inventoryApi.getCategories();
      const lines = ["name"];
      categories.forEach((c) => lines.push(esc(c.name)));
      download("categories.csv", lines.join("\n"));
      Alert.alert("✅", "categories.csv");
    } catch (e) {
      Alert.alert("Error", "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const importCategories = () => {
    if (Platform.OS !== "web") return Alert.alert("Import", "Web only.");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        setBusy(true);
        const rows = parseCSV(text);
        let count = 0;
        for (const r of rows.slice(1)) {
          const name = String(r[0] || "").trim();
          if (name) {
            await inventoryApi.createCategory({ name });
            count++;
          }
        }
        Alert.alert("✅", count + " " + t("importExport"));
      } catch (err) {
        Alert.alert("Error", "CSV?");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const importItems = () => {
    if (Platform.OS !== "web") return Alert.alert("Import", "Web only.");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        setBusy(true);
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error("empty");
        const header = rows[0].map((h) => h.trim().toLowerCase());
        const idx = (k) => header.indexOf(k);
        if (idx("name") === -1) throw new Error("no name column");

        const groups = {};
        rows.slice(1).forEach((r) => {
          const get = (k) => (idx(k) >= 0 ? String(r[idx(k)] || "").trim() : "");
          const name = get("name");
          if (!name) return;
          const key = name + "||" + get("category");
          if (!groups[key]) {
            groups[key] = { name, description: get("description"), category: get("category"), image_url: get("image_url"), variants: [] };
          }
          groups[key].variants.push({
            name: get("variant") || "Default",
            price: Number(get("price") || 0),
            stock_quantity: Number(get("stock") || 0),
            sku: get("sku"),
            barcode: get("barcode"),
          });
        });

        const categories = await inventoryApi.getCategories();
        const catMap = {};
        categories.forEach((c) => (catMap[c.name.toLowerCase()] = c.id));

        let created = 0;
        for (const key of Object.keys(groups)) {
          const g = groups[key];
          let categoryId = null;
          if (g.category) {
            const ck = g.category.toLowerCase();
            if (!catMap[ck]) {
              const createdCat = await inventoryApi.createCategory({ name: g.category });
              catMap[ck] = createdCat.id;
            }
            categoryId = catMap[ck];
          }
          await inventoryApi.createProduct({
            name: g.name,
            description: g.description || "",
            category_id: categoryId,
            image_url: g.image_url || "",
            variants: g.variants,
          });
          created++;
        }
        Alert.alert("✅", created + " " + t("items"));
      } catch (err) {
        Alert.alert("Error", "CSV: name,description,category,variant,price,stock,sku,barcode,image_url");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📤 {t("importExport")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("items")}</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={exportItems} disabled={busy}>
            <Text style={styles.buttonText}>{t("exportItems")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={importItems} disabled={busy}>
            <Text style={styles.buttonTextSecondary}>{t("importItems")}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>name, description, category, variant, price, stock, sku, barcode, image_url</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("category")}</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={exportCategories} disabled={busy}>
            <Text style={styles.buttonText}>{t("exportCategories")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={importCategories} disabled={busy}>
            <Text style={styles.buttonTextSecondary}>{t("importCategories")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={p.accent} />
        </View>
      ) : null}
    </ScrollView>
  );
}