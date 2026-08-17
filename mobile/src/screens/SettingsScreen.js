import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Modal, Image, Platform } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import { backofficeApi } from "../api/backoffice";
import { printReceipt } from "../services/printerService";
import { telegramApi } from "../api/telegram";
import CloudPrintSettings from "../components/CloudPrintSettings";

function BusinessHoursCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const { t } = useI18n();
  const save = ctx.updateSettings || ctx.saveSettings || ctx.setSettings || (() => {});
  const bh = settings.businessHours || { open: "09:00", close: "22:00" };
  const set = (key, value) => save({ businessHours: { ...bh, [key]: value } });
  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>🕒 {t("businessHours")}</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>{t("openTime")}</Text>
          <TextInput style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: "#F8FAFC", color: "#0F172A" }} value={bh.open} onChangeText={(v) => set("open", v)} placeholder="09:00" placeholderTextColor="#94A3B8" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>{t("closeTime")}</Text>
          <TextInput style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: "#F8FAFC", color: "#0F172A" }} value={bh.close} onChangeText={(v) => set("close", v)} placeholder="22:00" placeholderTextColor="#94A3B8" />
        </View>
      </View>
    </View>
  );
}
function QROrderingCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const { store } = useAuth();  // ← NEW: get real store from auth
  const save = ctx.updateSettings || (() => {});
  const on = Boolean(settings.qrOrderingEnabled);
  const [tables, setTables] = useState([]);

  useEffect(() => {
    if (!on) return;
    (async () => {
      try {
        const mod = await import("../api/backoffice");
        setTables((await mod.backofficeApi.getTables()) || []);
      } catch (e) {}
    })();
  }, [on]);

  const qrBase = typeof window !== "undefined" ? window.location.origin : "";
  
  // FIX: safely extract store name from any source
  const rawLine = settings.receipt?.headerLines?.[0];
  const firstHeaderLine = rawLine 
    ? (typeof rawLine === "string" ? rawLine : (rawLine.text || "")) 
    : "";
  const storeName = 
    (store && store.name) ||              // ← Primary: real store name
    firstHeaderLine ||                     // ← Fallback 1: receipt header
    settings.receipt?.headerText ||        // ← Fallback 2: legacy text
    "OUR STORE";                           // ← Final fallback

  const printOne = async (tb) => {
    try {
      const mod = await import("../services/printerService");
      mod.printQRSheet({ storeName, tableName: tb.name, qrUrl: qrBase + "/?qr=" + tb.id });
    } catch (e) { Alert.alert("❌", e.message); }
  };

  const printAll = async () => {
    try {
      const mod = await import("../services/printerService");
      mod.printQRSheets({ storeName, tables, qrBase });
    } catch (e) { Alert.alert("❌", e.message); }
  };

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>📲 QR Ordering (Self-Order)</Text>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: on ? "#43A047" : "#fff", borderWidth: 2, borderColor: on ? "#43A047" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={() => save({ qrOrderingEnabled: true })}>
          <Text style={{ color: on ? "#fff" : "#64748B", fontWeight: "bold" }}>ON</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, backgroundColor: !on ? "#EF4444" : "#fff", borderWidth: 2, borderColor: !on ? "#EF4444" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={() => save({ qrOrderingEnabled: false })}>
          <Text style={{ color: !on ? "#fff" : "#64748B", fontWeight: "bold" }}>OFF</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>Customers scan the QR on their table to browse the menu and order from their phone. Orders arrive in your POS for approval.</Text>
      {on ? (
        <View>
          {tables.map((tb) => (
            <View key={tb.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#334155" }}>🪑 {tb.name}</Text>
              <TouchableOpacity style={{ backgroundColor: "#0EA5E9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => printOne(tb)}>
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>🖨 Print QR</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={{ backgroundColor: "#0F172A", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 6 }} onPress={printAll}>
            <Text style={{ color: "#fff", fontWeight: "bold" }}>🖨 Print ALL Table QRs</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>💡 Tip: print stickers from your LIVE app (Vercel) so the QR links to your online menu.</Text>
        </View>
      ) : null}
    </View>
  );
}

function TableTimingCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const save = ctx.updateSettings || (() => {});
  const on = Boolean(settings.tableTimingEnabled);
  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>⏱ Table Timing (Snooker Mode)</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: on ? "#43A047" : "#fff", borderWidth: 2, borderColor: on ? "#43A047" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={() => save({ tableTimingEnabled: true })}>
          <Text style={{ color: on ? "#fff" : "#64748B", fontWeight: "bold" }}>ON</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, backgroundColor: !on ? "#EF4444" : "#fff", borderWidth: 2, borderColor: !on ? "#EF4444" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={() => save({ tableTimingEnabled: false })}>
          <Text style={{ color: !on ? "#fff" : "#64748B", fontWeight: "bold" }}>OFF</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>When ON, occupied tables show a live timer: 🟢 under 30 min, 🟠 under 1 hour, 🔴 over 1 hour.</Text>
    </View>
  );
}

function KitchenPrinterCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const { t } = useI18n();
  const save = ctx.updateSettings || (() => {});
  const [cats, setCats] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import("../api/inventory");
        setCats((await mod.inventoryApi.getCategories()) || []);
      } catch (e) {}
    })();
  }, []);

  const kps = Array.isArray(settings.kitchenPrinters) && settings.kitchenPrinters.length
    ? settings.kitchenPrinters
    : settings.kitchenPrinter
      ? [{ id: "kp1", name: "Kitchen 1", ...settings.kitchenPrinter }]
      : [];
  const routing = settings.kpRouting || { default: kps[0] ? kps[0].id : "kp1", categories: {} };
  const setKps = (next) => save({ kitchenPrinters: next });
  const setRouting = (next) => save({ kpRouting: { default: routing.default, categories: {}, ...next } });

  const updateKP = (id, patch) => setKps(kps.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const addKP = () => setKps([...kps, { id: "kp" + Date.now(), name: "Kitchen " + (kps.length + 1), enabled: true, connection: "browser", paperSize: "80" }]);
  const removeKP = (id) => setKps(kps.filter((k) => k.id !== id));

  const testKP = async (kp) => {
    try {
      const mod = await import("../services/printerService");
      const res = await mod.printKitchenTicket({
        type: "NEW",
        table: "TEST",
        billNumber: 999,
        items: [{ name: "Test Pasta", quantity: 2, category_id: null, modifiers: [{ name: "NO SPICE" }] }],
        settings,
        printer: kp,
      });
      if (res.success) Alert.alert("✅", kp.name + ": ticket sent!");
      else Alert.alert("❌", res.error || "Failed");
    } catch (e) {
      Alert.alert("❌", e.message);
    }
  };

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>🍳 {t("kitchenPrinter") || "Kitchen Printer"}</Text>

      {kps.map((kp) => (
        <View key={kp.id} style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: "#fff", color: "#0F172A", fontWeight: "bold" }} value={kp.name} onChangeText={(v) => updateKP(kp.id, { name: v })} />
            <TouchableOpacity style={{ backgroundColor: kp.enabled === false ? "#94A3B8" : "#43A047", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }} onPress={() => updateKP(kp.id, { enabled: kp.enabled === false })}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>{kp.enabled === false ? "OFF" : "ON"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: "#0EA5E9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 }} onPress={() => testKP(kp)}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>🖨</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 }} onPress={() => removeKP(kp.id)}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {["browser", "network"].map((c) => (
              <TouchableOpacity key={c} style={{ flex: 1, backgroundColor: kp.connection === c ? "#43A047" : "#fff", borderWidth: 1, borderColor: kp.connection === c ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingVertical: 8, alignItems: "center" }} onPress={() => updateKP(kp.id, { connection: c })}>
                <Text style={{ color: kp.connection === c ? "#fff" : "#64748B", fontWeight: "bold", fontSize: 12 }}>{c.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            {["58", "80"].map((s) => (
              <TouchableOpacity key={s} style={{ flex: 1, backgroundColor: kp.paperSize === s ? "#43A047" : "#fff", borderWidth: 1, borderColor: kp.paperSize === s ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingVertical: 8, alignItems: "center" }} onPress={() => updateKP(kp.id, { paperSize: s })}>
                <Text style={{ color: kp.paperSize === s ? "#fff" : "#64748B", fontWeight: "bold", fontSize: 12 }}>{s}mm</Text>
              </TouchableOpacity>
            ))}
          </View>
          {kp.connection === "network" ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={{ flex: 2, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff", color: "#0F172A" }} value={kp.address || ""} onChangeText={(v) => updateKP(kp.id, { address: v })} placeholder="192.168.0.200" placeholderTextColor="#94A3B8" />
              <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff", color: "#0F172A" }} value={kp.port || ""} onChangeText={(v) => updateKP(kp.id, { port: v })} placeholder="9100" keyboardType="number-pad" />
            </View>
          ) : null}
        </View>
      ))}

      <TouchableOpacity style={{ backgroundColor: "#0F172A", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 14 }} onPress={addKP}>
        <Text style={{ color: "#fff", fontWeight: "bold" }}>➕ Add Kitchen Printer</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A", marginBottom: 8 }}>🎯 Item Routing</Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>Default printer for all items:</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {kps.map((kp) => (
          <TouchableOpacity key={kp.id} style={{ backgroundColor: routing.default === kp.id ? "#43A047" : "#fff", borderWidth: 1, borderColor: routing.default === kp.id ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => setRouting({ ...routing, default: kp.id })}>
            <Text style={{ color: routing.default === kp.id ? "#fff" : "#64748B", fontWeight: "bold", fontSize: 12 }}>{kp.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>Category overrides (optional):</Text>
      {cats.map((c) => (
        <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#334155" }} numberOfLines={1}>{c.name}</Text>
          <TouchableOpacity style={{ backgroundColor: !routing.categories[String(c.id)] ? "#43A047" : "#fff", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }} onPress={() => { const next = { ...routing.categories }; delete next[String(c.id)]; setRouting({ ...routing, categories: next }); }}>
            <Text style={{ color: !routing.categories[String(c.id)] ? "#fff" : "#64748B", fontSize: 11, fontWeight: "bold" }}>Default</Text>
          </TouchableOpacity>
          {kps.map((kp) => (
            <TouchableOpacity key={kp.id} style={{ backgroundColor: routing.categories[String(c.id)] === kp.id ? "#43A047" : "#fff", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }} onPress={() => setRouting({ ...routing, categories: { ...routing.categories, [String(c.id)]: kp.id } })}>
              <Text style={{ color: routing.categories[String(c.id)] === kp.id ? "#fff" : "#64748B", fontSize: 11, fontWeight: "bold" }}>{kp.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}


function TelegramCard() {
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const cfg = await telegramApi.getConfig();
        setToken(cfg.token || "");
        setChatId(cfg.chatId || "");
      } catch (e) {}
    })();
  }, []);

  const save = async () => {
    try {
      setLoading(true);
      await telegramApi.saveConfig(token, chatId);
      setStatus("✅ Saved!");
      setTimeout(() => setStatus(""), 3000);
    } catch (e) {
      setStatus("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const test = async () => {
    try {
      setLoading(true);
      await telegramApi.sendTest();
      setStatus("✅ " + t("telegramSent"));
      setTimeout(() => setStatus(""), 3000);
    } catch (e) {
      setStatus("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>🤖 {t("telegramBot")}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>{t("botToken")}</Text>
      <TextInput style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", color: "#0F172A", marginBottom: 8 }} value={token} onChangeText={setToken} placeholder="123456:ABCdef..." placeholderTextColor="#94A3B8" />
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>{t("chatId")}</Text>
      <TextInput style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", color: "#0F172A", marginBottom: 8 }} value={chatId} onChangeText={setChatId} placeholder="123456789" placeholderTextColor="#94A3B8" />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "#43A047", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={save} disabled={loading}>
          <Text style={{ color: "#fff", fontWeight: "bold" }}>{loading ? "..." : "Save"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "#0EA5E9", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} onPress={test} disabled={loading}>
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Test</Text>
        </TouchableOpacity>
      </View>
      {status ? <Text style={{ fontSize: 13, fontWeight: "bold", color: status.startsWith("✅") ? "#16A34A" : "#EF4444" }}>{status}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const { store, refreshStore } = useAuth();
  const { t } = useI18n();

  const [taxRateInput, setTaxRateInput] = useState("");
  const [savingVat, setSavingVat] = useState(false);

  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetType, setResetType] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const rc = settings.receipt || {};
  const printer = settings.printer || {};

  const [headerLines, setHeaderLines] = useState(() => {
    const base = Array.isArray(rc.headerLines) ? rc.headerLines : [rc.headerText || ""];
    const arr = base.map((l) => (typeof l === "string" ? l : (l.text || "")));
    while (arr.length < 5) arr.push("");
    return arr.slice(0, 5);
  });
  const [footerLines, setFooterLines] = useState(() => {
    const base = Array.isArray(rc.footerLines) ? rc.footerLines : [rc.footerText || ""];
    const arr = base.map((l) => (typeof l === "string" ? l : (l.text || "")));
    while (arr.length < 5) arr.push("");
    return arr.slice(0, 5);
  });

  useEffect(() => {
    refreshStore();
  }, [refreshStore]);

  useEffect(() => {
    if (store) setTaxRateInput(String(store.tax_rate ?? 0));
  }, [store]);

  const setPrinter = (patch) => updateSettings({ printer: { ...settings.printer, ...patch } });
  const saveReceipt = (patch) => updateSettings({ receipt: { ...settings.receipt, ...patch } });

  const setHeaderLine = (i, v) => {
    const next = [...headerLines];
    next[i] = v;
    setHeaderLines(next);
    saveReceipt({ headerLines: next });
  };

  const setFooterLine = (i, v) => {
    const next = [...footerLines];
    next[i] = v;
    setFooterLines(next);
    saveReceipt({ footerLines: next });
  };

  const pickLogo = (which) => {
    if (Platform.OS !== "web") {
      Alert.alert(t("upload"), "Web only.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const max = 300;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL("image/png");
          if (which === "header") saveReceipt({ headerLogo: data });
          else saveReceipt({ footerLogo: data });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const saveVat = async (inclusive) => {
    try {
      setSavingVat(true);
      await backofficeApi.updateStoreSettings({ tax_inclusive: inclusive, tax_rate: Number(taxRateInput || 0) });
      await refreshStore();
      Alert.alert("✅", inclusive ? t("incl") : t("excl"));
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed.");
    } finally {
      setSavingVat(false);
    }
  };

  const openResetModal = (type) => {
    setResetType(type);
    setResetPassword("");
    setResetModalVisible(true);
  };

  const confirmReset = async () => {
    try {
      setResetting(true);
      if (resetType === "full") {
        await backofficeApi.resetFull(resetPassword);
        Alert.alert("✅", t("fullReset"));
      } else {
        await backofficeApi.resetSales(resetPassword);
        Alert.alert("✅", t("resetSales"));
      }
      setResetModalVisible(false);
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed.");
    } finally {
      setResetting(false);
    }
  };

  const handleTestPrint = async () => {
    const result = await printReceipt({
      items: [{ name: "Test Item", quantity: 1, price: 10 }],
      subtotal: 10, tax: 0, total: 10,
      payment: { payment_method: "cash", amount_tendered: 10, change_due: 0, payments: [{ method: "cash", amount: 10 }] },
      store, settings, orderId: "TEST000123", billNumber: 1,
      dining: settings.diningEnabled ? "dine_in" : null,
    });
    if (!result.success) Alert.alert("Print Failed", result.error || "Could not print.");
  };

  const isInclusive = Boolean(store && store.tax_inclusive);
  const rate = Number(store && store.tax_rate ? store.tax_rate : 0);
  const sampleTotal = 10;
  const sampleTax = isInclusive ? sampleTotal - sampleTotal / (1 + rate / 100) : (sampleTotal * rate) / 100;
  const sampleSubtotal = isInclusive ? sampleTotal - sampleTax : sampleTotal;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{t("businessHours")}</Text>
        <BusinessHoursCard />

        <Text style={styles.sectionTitle}>{t("telegramBot")}</Text>
        <TelegramCard />

        <Text style={styles.sectionTitle}>{t("vatTax")}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("taxRate")} (%)</Text>
          <TextInput style={styles.input} value={taxRateInput} onChangeText={setTaxRateInput} keyboardType="decimal-pad" placeholder="5" />
          <Text style={styles.cardLabel}>{t("vatMode")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, isInclusive && styles.optionButtonActive]} onPress={() => saveVat(true)} disabled={savingVat}>
              <Text style={[styles.optionText, isInclusive && styles.optionTextActive]}>{t("incl")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, !isInclusive && styles.optionButtonActive]} onPress={() => saveVat(false)} disabled={savingVat}>
              <Text style={[styles.optionText, !isInclusive && styles.optionTextActive]}>{t("excl")}</Text>
            </TouchableOpacity>
          </View>
          {savingVat && <ActivityIndicator size="small" color="#43A047" style={{ marginTop: 10 }} />}
        </View>

        <Text style={styles.sectionTitle}>{t("appearance")}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("theme")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, !settings.darkMode && styles.optionButtonActive]} onPress={() => updateSettings({ darkMode: false })}>
              <Text style={[styles.optionText, !settings.darkMode && styles.optionTextActive]}>{t("light")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, settings.darkMode && styles.optionButtonActive]} onPress={() => updateSettings({ darkMode: true })}>
              <Text style={[styles.optionText, settings.darkMode && styles.optionTextActive]}>{t("dark")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardLabel}>{t("cardsPerRow")}</Text>
          <View style={styles.optionRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={String(settings.gridColumns || 3)}
              onChangeText={(v) => {
                const n = parseInt(v, 10);
                if (!Number.isNaN(n)) updateSettings({ gridColumns: Math.min(8, Math.max(1, n)) });
              }}
              keyboardType="number-pad"
            />
            {[3, 4, 5, 6].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.optionButton, Number(settings.gridColumns || 3) === n && styles.optionButtonActive]}
                onPress={() => updateSettings({ gridColumns: n })}
              >
                <Text style={[styles.optionText, Number(settings.gridColumns || 3) === n && styles.optionTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.cardHint}>{t("cardsHint")}</Text>

          <Text style={styles.cardLabel}>{t("productLayout")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, settings.productLayout === "list" && styles.optionButtonActive]} onPress={() => updateSettings({ productLayout: "list" })}>
              <Text style={[styles.optionText, settings.productLayout === "list" && styles.optionTextActive]}>{t("list")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, settings.productLayout !== "list" && styles.optionButtonActive]} onPress={() => updateSettings({ productLayout: "grid" })}>
              <Text style={[styles.optionText, settings.productLayout !== "list" && styles.optionTextActive]}>{t("grid")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t("features")}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("diningOptions")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, settings.diningEnabled && styles.optionButtonActive]} onPress={() => updateSettings({ diningEnabled: true })}>
              <Text style={[styles.optionText, settings.diningEnabled && styles.optionTextActive]}>{t("on")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, !settings.diningEnabled && styles.optionButtonActive]} onPress={() => updateSettings({ diningEnabled: false })}>
              <Text style={[styles.optionText, !settings.diningEnabled && styles.optionTextActive]}>{t("off")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardLabel}>{t("useTables")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, settings.tablesEnabled && styles.optionButtonActive]} onPress={() => updateSettings({ tablesEnabled: true })}>
              <Text style={[styles.optionText, settings.tablesEnabled && styles.optionTextActive]}>{t("on")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, !settings.tablesEnabled && styles.optionButtonActive]} onPress={() => updateSettings({ tablesEnabled: false })}>
              <Text style={[styles.optionText, !settings.tablesEnabled && styles.optionTextActive]}>{t("off")}</Text>
            </TouchableOpacity>
          </View>
        </View>
           <Text style={styles.sectionTitle}>⏱ Table Timing</Text>
        <TableTimingCard />
		<Text style={styles.sectionTitle}>📲 QR Ordering</Text>
        <QROrderingCard />

        <Text style={styles.sectionTitle}>{t("kitchfenPrinter") || "Kitchen Printer"}</Text>
        <KitchenPrinterCard />

        {/* ☁️ CLOUD PRINT ADDED HERE */}
        <Text style={styles.sectionTitle}>☁️ Cloud Print (Agent)</Text>
        <CloudPrintSettings />

        <Text style={styles.sectionTitle}>{t("printer")}</Text>
        <View style={styles.card}>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, printer.enabled && styles.optionButtonActive]} onPress={() => setPrinter({ enabled: true })}>
              <Text style={[styles.optionText, printer.enabled && styles.optionTextActive]}>{t("printerOn")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, !printer.enabled && styles.optionButtonDanger]} onPress={() => setPrinter({ enabled: false })}>
              <Text style={[styles.optionText, !printer.enabled && styles.optionTextDanger]}>{t("off")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardLabel}>{t("connection")}</Text>
          <View style={styles.optionRow}>
            {["bluetooth", "usb", "network"].map((type) => (
              <TouchableOpacity key={type} style={[styles.optionButton, printer.connection === type && styles.optionButtonActive]} onPress={() => setPrinter({ connection: type })}>
                <Text style={[styles.optionText, printer.connection === type && styles.optionTextActive]}>{t(type)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {printer.connection === "network" ? (
            <View>
              <Text style={styles.cardLabel}>{t("ipAddress")}</Text>
              <TextInput style={styles.input} value={printer.address} onChangeText={(v) => setPrinter({ address: v })} placeholder="192.168.0.100" />
              <Text style={styles.cardLabel}>{t("port")}</Text>
              <TextInput style={styles.input} value={printer.port} onChangeText={(v) => setPrinter({ port: v })} placeholder="9100" keyboardType="number-pad" />
            </View>
          ) : null}
          <TouchableOpacity style={styles.testButton} onPress={handleTestPrint}>
            <Text style={styles.testButtonText}>{t("testPrint")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{t("receiptDesign")}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("headerLogo")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, styles.optionButtonActive]} onPress={() => pickLogo("header")}>
              <Text style={[styles.optionText, styles.optionTextActive]}>{t("upload")}</Text>
            </TouchableOpacity>
            {rc.headerLogo ? (
              <TouchableOpacity style={[styles.optionButton, styles.optionButtonDanger]} onPress={() => saveReceipt({ headerLogo: "" })}>
                <Text style={[styles.optionText, styles.optionTextDanger]}>{t("remove")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {rc.headerLogo ? <Image source={{ uri: rc.headerLogo }} style={styles.logoPreview} resizeMode="contain" /> : null}

          <Text style={styles.cardLabel}>{t("headerLines")}</Text>
          {headerLines.map((line, i) => (
            <TextInput key={"h" + i} style={styles.input} value={line} onChangeText={(v) => setHeaderLine(i, v)} placeholder={"Header line " + (i + 1)} />
          ))}

          <Text style={styles.cardLabel}>{t("footerLines")}</Text>
          {footerLines.map((line, i) => (
            <TextInput key={"f" + i} style={styles.input} value={line} onChangeText={(v) => setFooterLine(i, v)} placeholder={"Footer line " + (i + 1)} />
          ))}

          <Text style={styles.cardLabel}>{t("footerLogo")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, styles.optionButtonActive]} onPress={() => pickLogo("footer")}>
              <Text style={[styles.optionText, styles.optionTextActive]}>{t("upload")}</Text>
            </TouchableOpacity>
            {rc.footerLogo ? (
              <TouchableOpacity style={[styles.optionButton, styles.optionButtonDanger]} onPress={() => saveReceipt({ footerLogo: "" })}>
                <Text style={[styles.optionText, styles.optionTextDanger]}>{t("remove")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {rc.footerLogo ? <Image source={{ uri: rc.footerLogo }} style={styles.logoPreview} resizeMode="contain" /> : null}

          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, rc.showTax !== false && styles.optionButtonActive]} onPress={() => saveReceipt({ showTax: true })}>
              <Text style={[styles.optionText, rc.showTax !== false && styles.optionTextActive]}>{t("showVat")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, rc.showTax === false && styles.optionButtonActive]} onPress={() => saveReceipt({ showTax: false })}>
              <Text style={[styles.optionText, rc.showTax === false && styles.optionTextActive]}>{t("hideVat")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardLabel}>{t("paperSize")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, rc.paperSize !== "58" && styles.optionButtonActive]} onPress={() => saveReceipt({ paperSize: "80" })}>
              <Text style={[styles.optionText, rc.paperSize !== "58" && styles.optionButtonActive]}>80mm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, rc.paperSize === "58" && styles.optionButtonActive]} onPress={() => saveReceipt({ paperSize: "58" })}>
              <Text style={[styles.optionText, rc.paperSize === "58" && styles.optionTextActive]}>58mm</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardLabel}>{t("receiptCounter")}</Text>
          <Text style={styles.cardHint}>{t("startFrom")}</Text>
          <TextInput
            style={styles.input}
            value={String(rc.counterStart ?? 1)}
            onChangeText={(v) => {
              const n = parseInt(v, 10);
              if (!Number.isNaN(n) && n >= 1) saveReceipt({ counterStart: n });
            }}
            keyboardType="number-pad"
          />
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionButton, (rc.counterMode || "continuous") === "daily" && styles.optionButtonActive]}
              onPress={() => saveReceipt({ counterMode: "daily" })}
            >
              <Text style={[styles.optionText, (rc.counterMode || "continuous") === "daily" && styles.optionTextActive]}>{t("resetDaily")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, (rc.counterMode || "continuous") === "continuous" && styles.optionButtonActive]}
              onPress={() => saveReceipt({ counterMode: "continuous" })}
            >
              <Text style={[styles.optionText, (rc.counterMode || "continuous") === "continuous" && styles.optionTextActive]}>{t("continuous")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardHint}>
            {(rc.counterMode || "continuous") === "daily" ? t("dailyHint") : t("contHint")}
          </Text>

          <Text style={styles.cardLabel}>{t("livePreview")}</Text>
          <View style={styles.previewCard}>
            {rc.headerLogo ? <Image source={{ uri: rc.headerLogo }} style={styles.previewLogo} resizeMode="contain" /> : null}
            {headerLines.filter((l) => l.trim() !== "").map((l, i) => (
              <Text key={"ph" + i} style={styles.previewCenter}>{l}</Text>
            ))}
            <Text style={styles.previewCenter}>{new Date().toLocaleString()}</Text>
            <Text style={[styles.previewCenter, { fontSize: 14, fontWeight: "bold" }]}>{t("billNoSample")}</Text>
            <Text style={[styles.previewCenter, { fontSize: 14, fontWeight: "bold" }]}>{t("dineIn")}</Text>
            <Text style={styles.previewDivider}>{"-".repeat(32)}</Text>
            <Text style={styles.previewLeft}>Test Item</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewText}>1 x 10.00</Text>
              <Text style={styles.previewText}>10.00</Text>
            </View>
            <Text style={styles.previewDivider}>{"-".repeat(32)}</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewText}>{isInclusive ? t("subtotalExcl") : t("subtotal")}</Text>
              <Text style={styles.previewText}>{sampleSubtotal.toFixed(2)}</Text>
            </View>
            {rc.showTax !== false ? (
              <View style={styles.previewRow}>
                <Text style={styles.previewText}>{isInclusive ? t("vatIncl") : t("vatExcl")}</Text>
                <Text style={styles.previewText}>{sampleTax.toFixed(2)}</Text>
              </View>
            ) : null}
            <View style={styles.previewRow}>
              <Text style={[styles.previewText, { fontWeight: "bold" }]}>{t("total")}</Text>
              <Text style={[styles.previewText, { fontWeight: "bold" }]}>{(isInclusive ? sampleTotal : sampleTotal + sampleTax).toFixed(2)}</Text>
            </View>
            <Text style={styles.previewDivider}>{"-".repeat(32)}</Text>
            {footerLines.filter((l) => l.trim() !== "").map((l, i) => (
              <Text key={"pf" + i} style={styles.previewCenter}>{l}</Text>
            ))}
            {rc.footerLogo ? <Image source={{ uri: rc.footerLogo }} style={styles.previewLogo} resizeMode="contain" /> : null}
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t("localization")}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("currencySymbol")}</Text>
          <TextInput
            style={styles.input}
            value={settings.currencySymbol || "$"}
            onChangeText={(v) => updateSettings({ currencySymbol: v })}
            placeholder="AED / د.إ / $"
          />
          <Text style={styles.cardLabel}>{t("decimals")}</Text>
          <View style={styles.optionRow}>
            {[0, 2, 3].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.optionButton, Number(settings.decimals ?? 2) === d && styles.optionButtonActive]}
                onPress={() => updateSettings({ decimals: d })}
              >
                <Text style={[styles.optionText, Number(settings.decimals ?? 2) === d && styles.optionTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.cardLabel}>{t("receiptLanguage")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionButton, (settings.receiptLanguage || "en") === "en" && styles.optionButtonActive]}
              onPress={() => updateSettings({ receiptLanguage: "en" })}
            >
              <Text style={[styles.optionText, (settings.receiptLanguage || "en") === "en" && styles.optionTextActive]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, (settings.receiptLanguage || "en") === "ar" && styles.optionTextActive]}
              onPress={() => updateSettings({ receiptLanguage: "ar" })}
            >
              <Text style={[styles.optionText, (settings.receiptLanguage || "en") === "ar" && styles.optionTextActive]}>العربية</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t("dangerZone")}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("dangerZone")}</Text>
          <Text style={styles.cardHint}>{t("adminPass")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={styles.resetSalesButton} onPress={() => openResetModal("sales")}>
              <Text style={styles.resetButtonText}>{t("resetSales")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetFullButton} onPress={() => openResetModal("full")}>
              <Text style={styles.resetButtonText}>{t("fullReset")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t("store")}</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>{t("storeName")}</Text><Text style={styles.infoValue}>{store ? store.name : "-"}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>{t("currency")}</Text><Text style={styles.infoValue}>{store ? store.currency : "USD"}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>{t("taxRate")}</Text><Text style={styles.infoValue}>{store ? store.tax_rate : 0}%</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>{t("vatMode")}</Text><Text style={styles.infoValue}>{isInclusive ? t("incl") : t("excl")}</Text></View>
        </View>
      </ScrollView>

      <Modal visible={resetModalVisible} transparent animationType="fade" onRequestClose={() => setResetModalVisible(false)}>
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>{resetType === "full" ? "⚠️ " + t("fullReset") : "🗑 " + t("resetSales")}</Text>
            <Text style={styles.resetWarning}>
              {resetType === "full" ? t("resetWarningFull") : t("resetWarningSales")}
            </Text>
            <Text style={styles.paymentLabel}>{t("enterAdminPassword")}</Text>
            <TextInput style={styles.paymentInput} value={resetPassword} onChangeText={setResetPassword} secureTextEntry placeholder="•••••••" keyboardType="number-pad" />
            <View style={styles.paymentButtonRow}>
              <TouchableOpacity style={styles.paymentCancelButton} onPress={() => setResetModalVisible(false)}>
                <Text style={styles.paymentCancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentConfirmButton, { backgroundColor: "#EF4444" }]} onPress={confirmReset} disabled={resetting || !resetPassword}>
                <Text style={styles.paymentConfirmText}>{resetting ? t("resetting") : t("confirmReset")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  content: { padding: 20, width: "100%", maxWidth: 700, alignSelf: "center" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#64748B", marginVertical: 12, textTransform: "uppercase", letterSpacing: 1 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 20, marginBottom: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  cardLabel: { fontSize: 15, fontWeight: "600", color: "#0F172A", marginBottom: 10, marginTop: 14 },
  cardHint: { fontSize: 13, color: "#94A3B8", marginTop: 8, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: "#F8FAFC", marginBottom: 6 },
  optionRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  optionButton: { flex: 1, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  optionButtonActive: { backgroundColor: "#43A047", borderColor: "#43A047" },
  optionButtonDanger: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  optionText: { color: "#64748B", fontWeight: "bold", fontSize: 14 },
  optionTextActive: { color: "#fff" },
  optionTextDanger: { color: "#fff" },
  testButton: { backgroundColor: "#0F172A", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  testButtonText: { color: "#fff", fontWeight: "bold" },
  logoPreview: { width: 120, height: 60, marginTop: 10, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8 },
  previewCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#0F172A", borderRadius: 8, padding: 14, marginTop: 6 },
  previewLogo: { width: 90, height: 40, alignSelf: "center", marginBottom: 6 },
  previewCenter: { textAlign: "center", fontFamily: "Courier New", fontSize: 12, color: "#0F172A" },
  previewLeft: { fontFamily: "Courier New", fontSize: 12, color: "#0F172A" },
  previewRow: { flexDirection: "row", justifyContent: "space-between" },
  previewText: { fontFamily: "Courier New", fontSize: 12, color: "#0F172A" },
  previewDivider: { fontFamily: "Courier New", fontSize: 12, color: "#94A3B8", marginVertical: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  infoLabel: { color: "#64748B", fontSize: 15 },
  infoValue: { color: "#0F172A", fontSize: 15, fontWeight: "600" },
  resetSalesButton: { flex: 1, backgroundColor: "#F59E0B", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  resetFullButton: { flex: 1, backgroundColor: "#EF4444", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  resetButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  resetWarning: { fontSize: 14, color: "#64748B", marginBottom: 20, lineHeight: 20 },
  paymentOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  paymentCard: { width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  paymentTitle: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 10 },
  paymentLabel: { fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 8 },
  paymentInput: { borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, backgroundColor: "#F8FAFC", marginBottom: 20, textAlign: "center", fontWeight: "bold" },
  paymentButtonRow: { flexDirection: "row", gap: 12 },
  paymentCancelButton: { flex: 1, borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  paymentCancelText: { color: "#64748B", fontWeight: "bold", fontSize: 16 },
  paymentConfirmButton: { flex: 1, backgroundColor: "#43A047", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  paymentConfirmText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});