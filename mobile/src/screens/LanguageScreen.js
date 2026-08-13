import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { TRANSLATIONS } from "../i18n/translations";

export default function LanguageScreen() {
  const { settings, updateSettings } = useSettings();
  const { lang, setLanguage, t } = useI18n();
  const [search, setSearch] = useState("");
  const [customLang, setCustomLang] = useState("");
  const [busy, setBusy] = useState(false);

  const custom = (settings.customTranslations && settings.customTranslations[lang]) || {};
  const builtin = TRANSLATIONS[lang];

  const langList = ["en", "ar"];
  Object.keys(settings.customTranslations || {}).forEach((c) => {
    if (!langList.includes(c)) langList.push(c);
  });
  if (!langList.includes(lang)) langList.push(lang);

  const langLabel = (code) =>
    code === "en" ? "English" : code === "ar" ? "العربية" : code.toUpperCase();

  const addLanguage = () => {
    const code = customLang.trim().toLowerCase();
    if (!code) return;
    const all = settings.customTranslations || {};
    if (!all[code]) {
      updateSettings({ customTranslations: { ...all, [code]: {} }, language: code });
    } else {
      updateSettings({ language: code });
    }
    setCustomLang("");
  };

  const setTranslation = (key, value) => {
    const all = settings.customTranslations || {};
    const forLang = { ...(all[lang] || {}), [key]: value };
    updateSettings({ customTranslations: { ...all, [lang]: forLang } });
  };

  const autoTranslateAll = async () => {
    if (lang === "en") {
      Alert.alert("English", "English is the base language.");
      return;
    }
    setBusy(true);
    try {
      const keys = Object.keys(TRANSLATIONS.en);
      const all = settings.customTranslations || {};
      const forLang = { ...(all[lang] || {}) };
      let done = 0;
      for (let i = 0; i < keys.length; i += 5) {
        const chunk = keys.slice(i, i + 5);
        await Promise.all(
          chunk.map(async (k) => {
            if (forLang[k]) return;
            if (builtin && builtin[k]) return;
            const src = TRANSLATIONS.en[k];
            try {
              const r = await fetch(
                "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
                  encodeURIComponent(lang) +
                  "&dt=t&q=" +
                  encodeURIComponent(src)
              );
              const data = await r.json();
              const out = data && data[0] ? data[0].map((seg) => seg[0]).join("") : "";
              if (out) {
                forLang[k] = out;
                done++;
              }
            } catch (e) {}
          })
        );
      }
      updateSettings({ customTranslations: { ...all, [lang]: forLang } });
      Alert.alert("✨", done + " labels translated to " + langLabel(lang) + "!");
    } catch (e) {
      Alert.alert("Error", "Auto-translate failed. Check internet.");
    } finally {
      setBusy(false);
    }
  };

  const keys = Object.keys(TRANSLATIONS.en).filter(
    (k) =>
      k.toLowerCase().includes(search.toLowerCase()) ||
      String(TRANSLATIONS.en[k] || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🌐 {t("language")}</Text>

      <View style={styles.card}>
        <View style={styles.chipWrap}>
          {langList.map((code) => (
            <TouchableOpacity
              key={code}
              style={[styles.chip, lang === code && styles.chipActive]}
              onPress={() => setLanguage(code)}
            >
              <Text style={[styles.chipText, lang === code && styles.chipTextActive]}>{langLabel(code)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>
          {lang === "ar"
            ? t("rtlNote")
            : lang === "en"
            ? "Default language."
            : lang.toUpperCase() + ": tap ✨ Auto-Translate to fill all labels instantly, or type them yourself below."}
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={customLang}
            onChangeText={setCustomLang}
            placeholder={t("addLanguage")}
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addLanguage}>
            <Text style={styles.addBtnText}>{t("add")}</Text>
          </TouchableOpacity>
        </View>
        {lang !== "en" ? (
          <TouchableOpacity style={styles.autoBtn} onPress={autoTranslateAll} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.autoBtnText}>✨ Auto-Translate ALL → {langLabel(lang)}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("resourceEditor")} — {langLabel(lang)}</Text>
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder={t("searchLabels")}
          placeholderTextColor="#94A3B8"
        />
        {keys.map((k) => (
          <View key={k} style={styles.rowItem}>
            <Text style={styles.enLabel} numberOfLines={2}>{TRANSLATIONS.en[k]}</Text>
            <TextInput
              style={styles.input}
              value={custom[k] !== undefined ? custom[k] : (builtin && builtin[k]) || ""}
              onChangeText={(v) => setTranslation(k, v)}
              placeholder={t("translation")}
              placeholderTextColor="#94A3B8"
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  content: { padding: 20, width: "100%", maxWidth: 700, alignSelf: "center" },
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 14 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  chip: { borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  chipActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  chipText: { color: "#64748B", fontWeight: "bold" },
  chipTextActive: { color: "#fff" },
  hint: { fontSize: 12, color: "#94A3B8", marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", marginBottom: 6 },
  addBtn: { backgroundColor: "#43A047", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  addBtnText: { color: "#fff", fontWeight: "bold" },
  autoBtn: { backgroundColor: "#7C3AED", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 10 },
  autoBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  rowItem: { marginBottom: 8 },
  enLabel: { fontSize: 13, color: "#64748B", marginBottom: 4 },
});