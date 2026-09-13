import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Modal, Image, Platform } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import { backofficeApi } from "../api/backoffice";
import { api } from "../api/client";
import { printReceipt } from "../services/printerService";
import { telegramApi } from "../api/telegram";
import { uploadImage } from "../services/uploadService";
import { PREDEFINED_FORMATS, getFormatList, parseScaleBarcode } from "../services/barcodeParser";

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
  const { store } = useAuth();
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

  const rawLine = settings.receipt?.headerLines?.[0];
  const firstHeaderLine = rawLine
    ? (typeof rawLine === "string" ? rawLine : (rawLine.text || ""))
    : "";
  const storeName =
    (store && store.name) ||
    firstHeaderLine ||
    settings.receipt?.headerText ||
    "OUR STORE";

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

  const printTakeawayQR = async () => {
    try {
      const res = await api.get("/takeaway/qr-link");
      const token = res.data.token;
      
      if (!token) {
        Alert.alert("❌", "Takeaway token not found. Contact support.");
        return;
      }

      const takeawayUrl = qrBase + "/?takeaway=" + token;

      const mod = await import("../services/printerService");
      mod.printQRSheet({
        storeName,
        tableName: "TAKEAWAY",
        qrUrl: takeawayUrl,
      });
    } catch (e) {
      Alert.alert("❌", e.message);
    }
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
          <TouchableOpacity style={{ backgroundColor: "#E8590C", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 6 }} onPress={printTakeawayQR}>
            <Text style={{ color: "#fff", fontWeight: "bold" }}>🥡 Print TAKEAWAY QR (Counter Sticker)</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>💡 Tip: print stickers from your LIVE app (Vercel) so the QR links to your online menu.</Text>
        </View>
      ) : null}
    </View>
  );
}

function CashDrawerCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const save = ctx.updateSettings || (() => {});

  const cd = settings.cashDrawer || { enabled: false, pin: 2, autoOnCash: true };
  const setCD = (patch) => save({ cashDrawer: { ...cd, ...patch } });

  const testDrawer = async () => {
    try {
      const mod = await import("../services/printerService");
      const res = await mod.openCashDrawer(settings);
      if (res.success) Alert.alert("✅", "Drawer signal sent!");
      else Alert.alert("❌", res.error || "Failed");
    } catch (e) {
      Alert.alert("❌", e.message);
    }
  };

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>💰 Cash Drawer</Text>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: cd.enabled ? "#43A047" : "#fff", borderWidth: 2, borderColor: cd.enabled ? "#43A047" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          onPress={() => setCD({ enabled: true })}
        >
          <Text style={{ color: cd.enabled ? "#fff" : "#64748B", fontWeight: "bold" }}>ON</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: !cd.enabled ? "#EF4444" : "#fff", borderWidth: 2, borderColor: !cd.enabled ? "#EF4444" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          onPress={() => setCD({ enabled: false })}
        >
          <Text style={{ color: !cd.enabled ? "#fff" : "#64748B", fontWeight: "bold" }}>OFF</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>
        Controls the physical cash drawer connected to your receipt printer via RJ11/RJ12 cable.
      </Text>

      {cd.enabled ? (
        <View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginBottom: 6, marginTop: 8 }}>📌 Drawer Pin</Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: cd.pin === 2 ? "#43A047" : "#fff", borderWidth: 1, borderColor: cd.pin === 2 ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
              onPress={() => setCD({ pin: 2 })}
            >
              <Text style={{ color: cd.pin === 2 ? "#fff" : "#64748B", fontWeight: "bold" }}>Pin 2 (Default)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: cd.pin === 5 ? "#43A047" : "#fff", borderWidth: 1, borderColor: cd.pin === 5 ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
              onPress={() => setCD({ pin: 5 })}
            >
              <Text style={{ color: cd.pin === 5 ? "#fff" : "#64748B", fontWeight: "bold" }}>Pin 5</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginBottom: 6 }}>💵 Auto-Open on Cash Payment</Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: cd.autoOnCash !== false ? "#43A047" : "#fff", borderWidth: 1, borderColor: cd.autoOnCash !== false ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
              onPress={() => setCD({ autoOnCash: true })}
            >
              <Text style={{ color: cd.autoOnCash !== false ? "#fff" : "#64748B", fontWeight: "bold" }}>ON</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: cd.autoOnCash === false ? "#EF4444" : "#fff", borderWidth: 1, borderColor: cd.autoOnCash === false ? "#EF4444" : "#CBD5E1", borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
              onPress={() => setCD({ autoOnCash: false })}
            >
              <Text style={{ color: cd.autoOnCash === false ? "#fff" : "#64748B", fontWeight: "bold" }}>OFF</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: "#0F172A", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
            onPress={testDrawer}
          >
            <Text style={{ color: "#fff", fontWeight: "bold" }}>🧪 Test Open Drawer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function ScaleBarcodeCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const save = ctx.updateSettings || (() => {});

  const scale = settings.scale || { enabled: false, formatKey: "ean13_t02", custom: null };
  const setScale = (patch) => save({ scale: { ...scale, ...patch } });

  const [testBarcode, setTestBarcode] = useState("");
  const [testResult, setTestResult] = useState(null);

  const formatList = getFormatList();
  const isCustom = scale.formatKey === "custom";

  const handleTest = () => {
    if (!testBarcode.trim()) {
      setTestResult({ error: "Enter a barcode to test" });
      return;
    }
    let format;
    if (isCustom && scale.custom) {
      format = scale.custom;
    } else {
      format = PREDEFINED_FORMATS[scale.formatKey];
    }
    if (!format) {
      setTestResult({ error: "No format selected" });
      return;
    }
    const result = parseScaleBarcode(testBarcode.trim(), format);
    if (result) {
      setTestResult({ success: true, ...result });
    } else {
      setTestResult({ error: "Barcode doesn't match this format (length should be " + format.length + ")" });
    }
  };

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>⚖️ Scale Barcode Settings</Text>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: scale.enabled ? "#43A047" : "#fff", borderWidth: 2, borderColor: scale.enabled ? "#43A047" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          onPress={() => setScale({ enabled: true })}
        >
          <Text style={{ color: scale.enabled ? "#fff" : "#64748B", fontWeight: "bold" }}>ON</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: !scale.enabled ? "#EF4444" : "#fff", borderWidth: 2, borderColor: !scale.enabled ? "#EF4444" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          onPress={() => setScale({ enabled: false })}
        >
          <Text style={{ color: !scale.enabled ? "#fff" : "#64748B", fontWeight: "bold" }}>OFF</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
        When ON, scanned barcodes from weighing scales will be parsed automatically to get item, weight, and price.
      </Text>

      {scale.enabled ? (
        <View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginBottom: 6 }}>📋 Barcode Format</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {formatList.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={{
                  borderWidth: 1,
                  borderColor: scale.formatKey === f.key ? "#43A047" : "#CBD5E1",
                  backgroundColor: scale.formatKey === f.key ? "#43A047" : "#fff",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginRight: 6,
                }}
                onPress={() => setScale({ formatKey: f.key })}
              >
                <Text style={{ color: scale.formatKey === f.key ? "#fff" : "#334155", fontSize: 11, fontWeight: "bold" }}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{
                borderWidth: 1,
                borderColor: isCustom ? "#F59E0B" : "#CBD5E1",
                backgroundColor: isCustom ? "#F59E0B" : "#fff",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
              onPress={() => setScale({ formatKey: "custom" })}
            >
              <Text style={{ color: isCustom ? "#fff" : "#334155", fontSize: 11, fontWeight: "bold" }}>
                🔧 Custom
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {isCustom ? (
            <View style={{ borderWidth: 1, borderColor: "#F59E0B", borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: "#FFFBEB" }}>
              <Text style={{ fontSize: 14, fontWeight: "bold", color: "#92400E", marginBottom: 8 }}>🔧 Custom Format Builder</Text>
              <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>Barcode Length:</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                {[8, 13, 18].map((len) => (
                  <TouchableOpacity
                    key={len}
                    style={{
                      flex: 1,
                      backgroundColor: (scale.custom?.length || 13) === len ? "#F59E0B" : "#fff",
                      borderWidth: 1,
                      borderColor: (scale.custom?.length || 13) === len ? "#F59E0B" : "#CBD5E1",
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: "center",
                    }}
                    onPress={() => setScale({ custom: { ...(scale.custom || {}), length: len } })}
                  >
                    <Text style={{ color: (scale.custom?.length || 13) === len ? "#fff" : "#64748B", fontWeight: "bold" }}>{len} digits</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Item Number: Start & Length</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.item?.start ?? 0)} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), item: { ...(scale.custom?.item || {}), start: parseInt(v) || 0 } } })} placeholder="Start" keyboardType="number-pad" />
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.item?.length ?? 5)} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), item: { ...(scale.custom?.item || {}), length: parseInt(v) || 5 } } })} placeholder="Length" keyboardType="number-pad" />
              </View>
              <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Weight: Start, Length, Decimals</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.weight?.start ?? "")} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), weight: { ...(scale.custom?.weight || {}), start: parseInt(v) || 0 } } })} placeholder="Start" keyboardType="number-pad" />
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.weight?.length ?? "")} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), weight: { ...(scale.custom?.weight || {}), length: parseInt(v) || 0 } } })} placeholder="Length" keyboardType="number-pad" />
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.weight?.decimals ?? "")} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), weight: { ...(scale.custom?.weight || {}), decimals: parseInt(v) || 0 } } })} placeholder="Dec" keyboardType="number-pad" />
              </View>
              <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Price (optional): Start, Length, Decimals</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.price?.start ?? "")} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), price: { ...(scale.custom?.price || {}), start: parseInt(v) || 0 } } })} placeholder="Start" keyboardType="number-pad" />
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.price?.length ?? "")} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), price: { ...(scale.custom?.price || {}), length: parseInt(v) || 0 } } })} placeholder="Length" keyboardType="number-pad" />
                <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff" }} value={String(scale.custom?.price?.decimals ?? "")} onChangeText={(v) => setScale({ custom: { ...(scale.custom || {}), price: { ...(scale.custom?.price || {}), decimals: parseInt(v) || 0 } } })} placeholder="Dec" keyboardType="number-pad" />
              </View>
            </View>
          ) : null}

          <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginBottom: 6 }}>🧪 Test Barcode</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: "#fff" }}
              value={testBarcode}
              onChangeText={setTestBarcode}
              placeholder="e.g. 2700012007500"
              keyboardType="number-pad"
            />
            <TouchableOpacity style={{ backgroundColor: "#0F172A", borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" }} onPress={handleTest}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>Test</Text>
            </TouchableOpacity>
          </View>

          {testResult ? (
            <View style={{
              backgroundColor: testResult.error ? "#FEF2F2" : "#F0FDF4",
              borderWidth: 1,
              borderColor: testResult.error ? "#FCA5A5" : "#86EFAC",
              borderRadius: 8,
              padding: 12,
            }}>
              {testResult.error ? (
                <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "bold" }}>❌ {testResult.error}</Text>
              ) : (
                <View>
                  <Text style={{ color: "#16A34A", fontSize: 13, fontWeight: "bold", marginBottom: 4 }}>✅ Parsed Successfully!</Text>
                  <Text style={{ fontSize: 12, color: "#334155" }}>Department: {testResult.department || "N/A"}</Text>
                  <Text style={{ fontSize: 12, color: "#334155" }}>Item ID: {testResult.itemId}</Text>
                  {testResult.weight !== null && <Text style={{ fontSize: 12, color: "#334155" }}>Weight: {testResult.weight.toFixed(3)} KG</Text>}
                  {testResult.price !== null && <Text style={{ fontSize: 12, color: "#334155" }}>Total Price: {testResult.price.toFixed(2)}</Text>}
                  {testResult.unitPrice !== null && <Text style={{ fontSize: 12, color: "#334155" }}>Unit Price/KG: {testResult.unitPrice.toFixed(2)}</Text>}
                </View>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// 🔌 SERIAL SCALE CARD (WebSocket Bridge Connection)
function SerialScaleCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const save = ctx.updateSettings || (() => {});

  const serial = settings.serialScale || { enabled: false, skipChars: 0 };
  const setSerial = (patch) => save({ serialScale: { ...serial, ...patch } });

  const [rawData, setRawData] = useState("");
  const [parsedWeight, setParsedWeight] = useState("0.000");
  const [wsConnected, setWsConnected] = useState(false);
  const [skipCharsInput, setSkipCharsInput] = useState(String(serial.skipChars || 0));

  useEffect(() => {
    setSkipCharsInput(String(serial.skipChars || 0));
  }, [serial.skipChars]);

  useEffect(() => {
    if (!serial.enabled) {
      setWsConnected(false);
      setRawData("");
      setParsedWeight("0.000");
      return;
    }

    let ws;
    let reconnectTimeout;
    let isMounted = true;

    const connect = () => {
      try {
        ws = new WebSocket("ws://localhost:8081");
        
        ws.onopen = () => {
          if (isMounted) setWsConnected(true);
        };
        
        ws.onmessage = (event) => {
          if (!isMounted) return;
          const raw = event.data;
          setRawData(raw);
          
          // Clean the data based on skipChars setting
          let clean = raw;
          const skip = Number(skipCharsInput) || 0;
          if (skip > 0 && clean.length > skip) {
            clean = clean.substring(skip);
          }
          
          // Replace comma with dot and extract number
          clean = clean.replace(/,/g, '.');
          const match = clean.match(/[-+]?\d*\.?\d+/);
          
          if (match) {
            setParsedWeight(match[0]);
          } else {
            setParsedWeight("0.000");
          }
        };
        
        ws.onclose = () => {
          if (isMounted) {
            setWsConnected(false);
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
        
        ws.onerror = () => {
          if (isMounted) {
            setWsConnected(false);
            if (ws) ws.close();
          }
        };
      } catch (e) {
        if (isMounted) {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [serial.enabled, skipCharsInput]);

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>🔌 Serial Scale (COM Port)</Text>
      
      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
        Connects to the local scale bridge service running on your PC (ws://localhost:8081).
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: serial.enabled ? "#43A047" : "#fff", borderWidth: 2, borderColor: serial.enabled ? "#43A047" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} 
          onPress={() => setSerial({ enabled: true })}
        >
          <Text style={{ color: serial.enabled ? "#fff" : "#64748B", fontWeight: "bold" }}>ON</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: !serial.enabled ? "#EF4444" : "#fff", borderWidth: 2, borderColor: !serial.enabled ? "#EF4444" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} 
          onPress={() => setSerial({ enabled: false })}
        >
          <Text style={{ color: !serial.enabled ? "#fff" : "#64748B", fontWeight: "bold" }}>OFF</Text>
        </TouchableOpacity>
      </View>

      {serial.enabled ? (
        <View>
          {/* Connection Status */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, padding: 10, backgroundColor: wsConnected ? "#F0FDF4" : "#FEF2F2", borderRadius: 8 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: wsConnected ? "#16A34A" : "#EF4444" }} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: wsConnected ? "#16A34A" : "#EF4444" }}>
              {wsConnected ? "Connected to Scale Bridge" : "Disconnected (Run node scale.js)"}
            </Text>
          </View>

          <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginBottom: 6 }}>✂️ Trim Garbage (Skip First X Characters)</Text>
          <TextInput 
            style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", color: "#0F172A", marginBottom: 8 }} 
            value={skipCharsInput} 
            onChangeText={(v) => {
              setSkipCharsInput(v);
              setSerial({ skipChars: Number(v) || 0 });
            }} 
            placeholder="0" 
            keyboardType="number-pad" 
          />
          <Text style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>
            If scale sends "ST,+ 1.250", count characters before the number starts and enter it here.
          </Text>

          {/* Live Preview */}
          <View style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "#E2E8F0" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Raw Data (Unclean):</Text>
            <Text style={{ fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: "#DC2626", marginBottom: 10, minHeight: 20 }}>
              {rawData || "Waiting for data..."}
            </Text>
            
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Parsed Weight (Clean):</Text>
            <Text style={{ fontSize: 28, fontWeight: "bold", color: "#16A34A" }}>
              {parsedWeight} <Text style={{ fontSize: 16, color: "#64748B" }}>kg</Text>
            </Text>
          </View>
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

// 🍳 RECIPE TRACKING CARD WITH EMBEDDED BUILDER
function RecipeTrackingCard() {
  const ctx = useSettings();
  const { settings } = ctx;
  const save = ctx.updateSettings || (() => {});
  const on = Boolean(settings.recipeTrackingEnabled);
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 14 }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 10 }}>🍳 Recipe & Ingredient Tracking</Text>
      
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: on ? "#43A047" : "#fff", borderWidth: 2, borderColor: on ? "#43A047" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} 
          onPress={() => save({ recipeTrackingEnabled: true })}
        >
          <Text style={{ color: on ? "#fff" : "#64748B", fontWeight: "bold" }}>ON</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: !on ? "#EF4444" : "#fff", borderWidth: 2, borderColor: !on ? "#EF4444" : "#E2E8F0", borderRadius: 10, paddingVertical: 12, alignItems: "center" }} 
          onPress={() => save({ recipeTrackingEnabled: false })}
        >
          <Text style={{ color: !on ? "#fff" : "#64748B", fontWeight: "bold" }}>OFF</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>
        Track raw ingredients (chicken, flour, oil), calculate true food costs, and auto-deduct stock when selling finished products.
      </Text>

      {on ? (
        <View>
          <View style={{ backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#86EFAC", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: "#166534", fontWeight: "600" }}>
              ✅ Active - Ingredients are being tracked on every sale
            </Text>
          </View>
          <TouchableOpacity 
            style={{ backgroundColor: "#E8590C", borderRadius: 10, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }} 
            onPress={() => setBuilderOpen(true)}
          >
            <Text style={{ fontSize: 18 }}>🍳</Text>
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>Open Recipe Builder</Text>
          </TouchableOpacity>

          {/* Recipe Builder Modal */}
          <Modal visible={builderOpen} transparent animationType="slide">
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }}>
              <View style={{ flex: 1, backgroundColor: "#F1F5F9" }}>
                <View style={{ 
                  flexDirection: "row", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  padding: 16, 
                  backgroundColor: "#fff",
                  borderBottomWidth: 1,
                  borderBottomColor: "#E2E8F0"
                }}>
                  <Text style={{ fontSize: 20, fontWeight: "bold", color: "#0F172A" }}>🍳 Recipe Builder</Text>
                  <TouchableOpacity 
                    style={{ backgroundColor: "#EF4444", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                    onPress={() => setBuilderOpen(false)}
                  >
                    <Text style={{ color: "#fff", fontWeight: "bold" }}>✕ Close</Text>
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={{ flex: 1, padding: 16 }}>
                  <RecipeBuilderContent />
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      ) : (
        <View style={{ backgroundColor: "#F1F5F9", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 12, color: "#64748B" }}>
            ⚪ Disabled - No effect on your POS. Toggle ON to enable ingredient tracking.
          </Text>
        </View>
      )}
    </View>
  );
}

// 🍳 EMBEDDED RECIPE BUILDER CONTENT - WITH COST ANALYSIS + STOCK TAB + DECIMAL FIX
function RecipeBuilderContent() {
  const [activeTab, setActiveTab] = useState("ingredients");
  const [ingredients, setIngredients] = useState([]);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Add ingredient form
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [stock, setStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [cost, setCost] = useState("");

  // Edit ingredient modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("kg");
  const [editStock, setEditStock] = useState("");
  const [editMinStock, setEditMinStock] = useState("");
  const [editCost, setEditCost] = useState("");

  // Recipe editor modal
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [baseItems, setBaseItems] = useState([]);
  const [variantItems, setVariantItems] = useState({});
  const [recipeLoading, setRecipeLoading] = useState(false);

  // Ingredient picker
  const [ingredientPickerOpen, setIngredientPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState("base");

  // Stock tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [addStockModal, setAddStockModal] = useState(null);
  const [addStockQty, setAddStockQty] = useState("");
  const [calculateModalOpen, setCalculateModalOpen] = useState(false);
  const [calculateData, setCalculateData] = useState(null);
  const [calculating, setCalculating] = useState(false);

  const UNITS = ["kg", "g", "l", "ml", "pcs"];

  const filteredIngredients = ingredients.filter((i) =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 💰 Cost calculation helpers
  const calculateRecipeCost = (items) => {
    let totalCost = 0;
    items.forEach((item) => {
      const ingredient = ingredients.find((i) => i.id === item.ingredient_id);
      if (ingredient) totalCost += Number(ingredient.cost_per_unit || 0) * Number(item.quantity_required || 0);
    });
    return totalCost;
  };

  const getMarginColor = (margin) => margin >= 60 ? "#16A34A" : margin >= 40 ? "#F59E0B" : "#DC2626";
  const getMarginLabel = (margin) => margin >= 60 ? "✅ Great" : margin >= 40 ? "⚠️ Okay" : "🔴 Low";

  const getVariantPrice = (variantId) => {
    if (!selectedProduct?.variants) return 0;
    const v = selectedProduct.variants.find((v) => String(v.id) === String(variantId));
    return v ? Number(v.price || 0) : 0;
  };

  const getBasePrice = () => {
    if (!selectedProduct) return 0;
    if (selectedProduct.variants && selectedProduct.variants.length > 0) return Number(selectedProduct.variants[0].price || 0);
    return Number(selectedProduct.price || 0);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [ingRes, prodRes, recRes] = await Promise.all([
        api.get("/ingredients").catch(() => ({ data: [] })),
        api.get("/inventory/products").catch(() => ({ data: [] })),
        api.get("/recipes").catch(() => ({ data: [] })),
      ]);
      setIngredients(Array.isArray(ingRes.data) ? ingRes.data : []);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setRecipes(Array.isArray(recRes.data) ? recRes.data : []);
    } catch (error) {
      console.error("Load data error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ==================== INGREDIENTS TAB ====================

  const addIngredient = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    try {
      setSaving(true);
      await api.post("/ingredients", {
        name: name.trim(),
        unit,
        current_stock: Number(stock) || 0,
        min_stock: Number(minStock) || 0,
        cost_per_unit: Number(cost) || 0
      });
      setName("");
      setStock("");
      setMinStock("");
      setCost("");
      loadData();
      Alert.alert("✅", "Ingredient added!");
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (ing) => {
    setEditingId(ing.id);
    setEditName(ing.name);
    setEditUnit(ing.unit);
    setEditStock(String(ing.current_stock));
    setEditMinStock(String(ing.min_stock));
    setEditCost(String(ing.cost_per_unit));
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    try {
      await api.put(`/ingredients/${editingId}`, {
        name: editName.trim(),
        unit: editUnit,
        current_stock: Number(editStock) || 0,
        min_stock: Number(editMinStock) || 0,
        cost_per_unit: Number(editCost) || 0
      });
      setEditModalOpen(false);
      loadData();
      Alert.alert("✅", "Ingredient updated!");
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed to update");
    }
  };

  const deleteIngredient = async (id, ingredientName) => {
    try {
      setDeletingId(id);
      await api.delete(`/ingredients/${id}`);
      loadData();
      Alert.alert("✅", `"${ingredientName}" deleted!`);
    } catch (error) {
      Alert.alert("❌ Error", error.response?.data?.error || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  // ==================== RECIPES TAB ====================

  const openRecipeEditor = async (product) => {
    setSelectedProduct(product);
    setRecipeLoading(true);
    setBaseItems([]);
    setVariantItems({});

    try {
      const res = await api.get(`/recipes/product/${product.id}`);
      const existing = Array.isArray(res.data) ? res.data : [];

      let base = [];
      let variants = {};

      existing.forEach((recipe) => {
        const items = Array.isArray(recipe.items) ? recipe.items : [];
        if (!recipe.variant_id) {
          base = items;
        } else {
          variants[String(recipe.variant_id)] = items;
        }
      });

      setBaseItems(base);
      setVariantItems(variants);
    } catch (error) {
      console.error("Load recipe error:", error);
    } finally {
      setRecipeLoading(false);
      setRecipeModalOpen(true);
    }
  };

  const openIngredientPicker = (target) => {
    setPickerTarget(target);
    setIngredientPickerOpen(true);
  };

  const addIngredientToRecipe = (ingredient) => {
    const newItem = {
      ingredient_id: ingredient.id,
      ingredient_name: ingredient.name,
      ingredient_unit: ingredient.unit,
      quantity_required: "",
    };

    if (pickerTarget === "base") {
      const exists = baseItems.find((i) => i.ingredient_id === ingredient.id);
      if (!exists) {
        setBaseItems([...baseItems, newItem]);
      }
    } else {
      const variantId = pickerTarget;
      const existing = variantItems[variantId] || [];
      const exists = existing.find((i) => i.ingredient_id === ingredient.id);
      if (!exists) {
        setVariantItems({
          ...variantItems,
          [variantId]: [...existing, newItem],
        });
      }
    }
    setIngredientPickerOpen(false);
  };

  // DECIMAL FIX: keep as string while typing, convert only when saving
  const updateRecipeQty = (target, ingredientId, qty) => {
    if (target === "base") {
      setBaseItems(
        baseItems.map((i) =>
          i.ingredient_id === ingredientId
            ? { ...i, quantity_required: qty }
            : i
        )
      );
    } else {
      const variantId = target;
      setVariantItems({
        ...variantItems,
        [variantId]: (variantItems[variantId] || []).map((i) =>
          i.ingredient_id === ingredientId
            ? { ...i, quantity_required: qty }
            : i
        ),
      });
    }
  };

  const removeRecipeItem = (target, ingredientId) => {
    if (target === "base") {
      setBaseItems(baseItems.filter((i) => i.ingredient_id !== ingredientId));
    } else {
      const variantId = target;
      setVariantItems({
        ...variantItems,
        [variantId]: (variantItems[variantId] || []).filter(
          (i) => i.ingredient_id !== ingredientId
        ),
      });
    }
  };

  const saveRecipe = async () => {
    if (baseItems.length === 0) {
      Alert.alert("Error", "Add at least one base ingredient");
      return;
    }

    try {
      setSaving(true);

      await api.post("/recipes", {
        product_id: selectedProduct.id,
        variant_id: null,
        items: baseItems.map((i) => ({
          ingredient_id: i.ingredient_id,
          quantity_required: Number(i.quantity_required) || 0,
        })),
      });

      const variantIds = Object.keys(variantItems);
      for (const variantId of variantIds) {
        const items = variantItems[variantId];
        if (items && items.length > 0) {
          await api.post("/recipes", {
            product_id: selectedProduct.id,
            variant_id: Number(variantId),
            items: items.map((i) => ({
              ingredient_id: i.ingredient_id,
              quantity_required: Number(i.quantity_required) || 0,
            })),
          });
        }
      }

      setRecipeModalOpen(false);
      loadData();
      Alert.alert("✅", "Recipe saved for " + selectedProduct.name + "!");
    } catch (error) {
      console.error("Save recipe error:", error);
      Alert.alert("Error", error.response?.data?.error || "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  };

  const hasRecipe = (productId) => {
    return recipes.some((r) => String(r.product_id) === String(productId));
  };

  const getRecipeInfo = (productId) => {
    const productRecipes = recipes.filter(
      (r) => String(r.product_id) === String(productId)
    );
    if (productRecipes.length === 0) return null;
    const totalIngredients = productRecipes.reduce(
      (sum, r) => sum + (Array.isArray(r.items) ? r.items.length : 0),
      0
    );
    return { count: productRecipes.length, totalIngredients };
  };

  // ==================== STOCK TAB ====================

  const openAddStock = (ing) => {
    setAddStockModal(ing);
    setAddStockQty("");
  };

  const confirmAddStock = async () => {
    if (!addStockModal) return;
    if (!addStockQty || Number(addStockQty) <= 0) {
      Alert.alert("Error", "Enter a valid quantity");
      return;
    }
    try {
      const newStock = Number(addStockModal.current_stock || 0) + Number(addStockQty);
      await api.put(`/ingredients/${addStockModal.id}`, {
        name: addStockModal.name,
        unit: addStockModal.unit,
        current_stock: newStock,
        min_stock: Number(addStockModal.min_stock || 0),
        cost_per_unit: Number(addStockModal.cost_per_unit || 0)
      });
      setAddStockModal(null);
      setAddStockQty("");
      loadData();
      Alert.alert("✅", "Stock updated!");
    } catch (error) {
      Alert.alert("Error", "Failed to update stock");
    }
  };

  const openCalculateModal = async () => {
    try {
      setCalculating(true);
      const res = await api.get("/ingredients/preview-deduction");
      setCalculateData(res.data);
      setCalculateModalOpen(true);
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed to calculate");
    } finally {
      setCalculating(false);
    }
  };

  const confirmCalculate = async () => {
    try {
      setCalculating(true);
      await api.post("/ingredients/calculate-deduction");
      setCalculateModalOpen(false);
      setCalculateData(null);
      loadData();
      Alert.alert("✅", "Ingredients deducted!");
    } catch (error) {
      Alert.alert("Error", error.response?.data?.error || "Failed to deduct");
    } finally {
      setCalculating(false);
    }
  };

  // ==================== RENDER ====================

  return (
    <View style={{ flex: 1 }}>
      {/* Tabs - 3 tabs now */}
      <View style={{ flexDirection: "row", backgroundColor: "#fff", borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: activeTab === "ingredients" ? "#E8590C" : "transparent", borderRadius: 10 }}
          onPress={() => setActiveTab("ingredients")}
        >
          <Text style={{ fontWeight: "bold", color: activeTab === "ingredients" ? "#fff" : "#64748B", fontSize: 12 }}>
            📦 Ingredients ({ingredients.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: activeTab === "recipes" ? "#E8590C" : "transparent", borderRadius: 10 }}
          onPress={() => setActiveTab("recipes")}
        >
          <Text style={{ fontWeight: "bold", color: activeTab === "recipes" ? "#fff" : "#64748B", fontSize: 12 }}>
            🍳 Recipes ({recipes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: activeTab === "stock" ? "#E8590C" : "transparent", borderRadius: 10 }}
          onPress={() => setActiveTab("stock")}
        >
          <Text style={{ fontWeight: "bold", color: activeTab === "stock" ? "#fff" : "#64748B", fontSize: 12 }}>
            📊 Stock
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "ingredients" ? (
        <View>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 12 }}>➕ Add New Ingredient</Text>
            
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Name *</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", marginBottom: 10, color: "#0F172A" }}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Chicken, Flour, Oil"
              placeholderTextColor="#94A3B8"
            />

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Unit</Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {UNITS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: unit === u ? "#43A047" : "#fff",
                    borderWidth: 1,
                    borderColor: unit === u ? "#43A047" : "#CBD5E1"
                  }}
                  onPress={() => setUnit(u)}
                >
                  <Text style={{ color: unit === u ? "#fff" : "#64748B", fontWeight: "bold", fontSize: 12 }}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Current Stock</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", color: "#0F172A" }}
                  value={stock}
                  onChangeText={setStock}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Min Stock</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", color: "#0F172A" }}
                  value={minStock}
                  onChangeText={setMinStock}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Cost per {unit}</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", marginBottom: 12, color: "#0F172A" }}
              value={cost}
              onChangeText={setCost}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor="#94A3B8"
            />

            <TouchableOpacity
              style={{ backgroundColor: "#43A047", borderRadius: 10, paddingVertical: 14, alignItems: "center" }}
              onPress={addIngredient}
              disabled={saving}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>
                {saving ? "Saving..." : "➕ Add Ingredient"}
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <ActivityIndicator size="large" color="#E8590C" />
              <Text style={{ color: "#64748B", marginTop: 10 }}>Loading...</Text>
            </View>
          ) : ingredients.length === 0 ? (
            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 30, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" }}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>📦</Text>
              <Text style={{ color: "#94A3B8", textAlign: "center" }}>No ingredients yet. Add your first ingredient above.</Text>
            </View>
          ) : (
            ingredients.map((ing) => {
              const isLow = Number(ing.current_stock) <= Number(ing.min_stock);
              const isDeleting = deletingId === ing.id;
              return (
                <View key={ing.id} style={{ backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A" }}>{ing.name}</Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        Stock: {Number(ing.current_stock).toFixed(2)} {ing.unit} • Min: {Number(ing.min_stock).toFixed(2)} {ing.unit}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isLow ? "#FEE2E2" : "#DCFCE7" }}>
                      <Text style={{ fontSize: 10, fontWeight: "bold", color: isLow ? "#DC2626" : "#16A34A" }}>
                        {isLow ? "⚠️ LOW" : "✅ OK"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                    <TouchableOpacity
                      style={{ backgroundColor: "#0EA5E9", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 }}
                      onPress={() => openEdit(ing)}
                      disabled={isDeleting}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>✏️ Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ backgroundColor: "#EF4444", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, opacity: isDeleting ? 0.5 : 1 }}
                      onPress={() => deleteIngredient(ing.id, ing.name)}
                      disabled={isDeleting}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>
                        {isDeleting ? "⏳" : "🗑 Delete"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : activeTab === "recipes" ? (
        <View>
          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <ActivityIndicator size="large" color="#E8590C" />
              <Text style={{ color: "#64748B", marginTop: 10 }}>Loading products...</Text>
            </View>
          ) : products.length === 0 ? (
            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 30, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" }}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>🍽️</Text>
              <Text style={{ color: "#94A3B8", textAlign: "center" }}>No products found. Add products in Inventory first.</Text>
            </View>
          ) : (
            products.map((product) => {
              const hasRec = hasRecipe(product.id);
              const recInfo = getRecipeInfo(product.id);
              return (
                <View key={product.id} style={{ backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A" }}>{product.name}</Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        {(product.variants || []).length} variant{(product.variants || []).length !== 1 ? "s" : ""}
                      </Text>
                      {hasRec && recInfo && (
                        <Text style={{ fontSize: 11, color: "#16A34A", marginTop: 2 }}>
                          ✅ {recInfo.totalIngredients} ingredients linked
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: hasRec ? "#DCFCE7" : "#F1F5F9"
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: hasRec ? "#16A34A" : "#94A3B8" }}>
                          {hasRec ? "✅ HAS RECIPE" : "📝 NO RECIPE"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={{ backgroundColor: "#E8590C", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                        onPress={() => openRecipeEditor(product)}
                      >
                        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>
                          {hasRec ? "✏️ Edit" : "➕ Create"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : (
        <View>
          <TextInput style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff", marginBottom: 12, color: "#0F172A" }} placeholder="🔍 Search ingredients..." placeholderTextColor="#94A3B8" value={searchQuery} onChangeText={setSearchQuery} />

          <TouchableOpacity style={{ backgroundColor: "#7C3AED", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 14, opacity: calculating ? 0.6 : 1 }} onPress={openCalculateModal} disabled={calculating}>
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>{calculating ? "⏳ Loading..." : "🧮 Calculate Recipe Deduction"}</Text>
          </TouchableOpacity>

          {filteredIngredients.length === 0 ? (
            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 30, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" }}>
              <Text style={{ color: "#94A3B8" }}>No ingredients found.</Text>
            </View>
          ) : (
            filteredIngredients.map((ing) => {
              const isLow = Number(ing.current_stock) <= Number(ing.min_stock);
              return (
                <View key={ing.id} style={{ backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A" }}>{ing.name}</Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Stock: {Number(ing.current_stock).toFixed(2)} {ing.unit} • Min: {Number(ing.min_stock).toFixed(2)} {ing.unit}</Text>
                      <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Cost: {Number(ing.cost_per_unit || 0).toFixed(2)} / {ing.unit}</Text>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isLow ? "#FEE2E2" : "#DCFCE7" }}>
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: isLow ? "#DC2626" : "#16A34A" }}>{isLow ? "⚠️ LOW" : "✅ OK"}</Text>
                      </View>
                      <TouchableOpacity style={{ backgroundColor: "#0EA5E9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={() => openAddStock(ing)}>
                        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 11 }}>+ Stock</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ==================== RECIPE EDITOR MODAL ==================== */}
      <Modal visible={recipeModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View style={{ flex: 1, backgroundColor: "#F1F5F9", marginTop: 40 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>
                  🍳 Recipe: {selectedProduct?.name}
                </Text>
                <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                  Base + variant additions
                </Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: "#EF4444", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
                onPress={() => setRecipeModalOpen(false)}
              >
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }}>
              {recipeLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color="#E8590C" />
                  <Text style={{ color: "#64748B", marginTop: 10 }}>Loading recipe...</Text>
                </View>
              ) : (
                <View>
                  <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 }}>
                    <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A", marginBottom: 4 }}>
                      📋 Base Ingredients (all variants)
                    </Text>
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
                      These ingredients are used for every variant of this product.
                    </Text>

                    {baseItems.length === 0 ? (
                      <Text style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", paddingVertical: 10 }}>
                        No base ingredients added yet
                      </Text>
                    ) : (
                      baseItems.map((item) => (
                        <View key={item.ingredient_id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10 }}>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#0F172A" }}>
                            {item.ingredient_name}
                          </Text>
                          <TextInput
                            style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, backgroundColor: "#fff", width: 70, textAlign: "center", color: "#0F172A" }}
                            value={String(item.quantity_required)}
                            onChangeText={(t) => updateRecipeQty("base", item.ingredient_id, t)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                          />
                          <Text style={{ fontSize: 11, color: "#64748B", width: 30 }}>
                            {item.ingredient_unit}
                          </Text>
                          <TouchableOpacity
                            style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}
                            onPress={() => removeRecipeItem("base", item.ingredient_id)}
                          >
                            <Text style={{ color: "#DC2626", fontWeight: "bold", fontSize: 12 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}

                    <TouchableOpacity
                      style={{ backgroundColor: "#E8590C", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 8 }}
                      onPress={() => openIngredientPicker("base")}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>➕ Add Ingredient</Text>
                    </TouchableOpacity>
                  </View>

                  {(selectedProduct?.variants || []).length > 1 ? (
                    <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 }}>
                      <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A", marginBottom: 4 }}>
                        🔀 Variant Additions (extra per variant)
                      </Text>
                      <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
                        Extra ingredients added on top of base when this variant is sold.
                      </Text>

                      {(selectedProduct?.variants || []).map((variant) => {
                        const vItems = variantItems[String(variant.id)] || [];
                        return (
                          <View key={variant.id} style={{ marginBottom: 12, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: "bold", color: "#334155", marginBottom: 6 }}>
                              📦 {variant.name}
                            </Text>

                            {vItems.length === 0 ? (
                              <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 6 }}>
                                No extra ingredients (uses base only)
                              </Text>
                            ) : (
                              vItems.map((item) => (
                                <View key={item.ingredient_id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, backgroundColor: "#F8FAFC", borderRadius: 6, padding: 8 }}>
                                  <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: "#0F172A" }}>
                                    +{item.ingredient_name}
                                  </Text>
                                  <TextInput
                                    style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, backgroundColor: "#fff", width: 60, textAlign: "center", color: "#0F172A" }}
                                    value={String(item.quantity_required)}
                                    onChangeText={(t) => updateRecipeQty(String(variant.id), item.ingredient_id, t)}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor="#94A3B8"
                                  />
                                  <Text style={{ fontSize: 10, color: "#64748B", width: 28 }}>
                                    {item.ingredient_unit}
                                  </Text>
                                  <TouchableOpacity
                                    style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 }}
                                    onPress={() => removeRecipeItem(String(variant.id), item.ingredient_id)}
                                  >
                                    <Text style={{ color: "#DC2626", fontWeight: "bold", fontSize: 11 }}>✕</Text>
                                  </TouchableOpacity>
                                </View>
                              ))
                            )}

                            <TouchableOpacity
                              style={{ backgroundColor: "#F1F5F9", borderRadius: 6, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" }}
                              onPress={() => openIngredientPicker(String(variant.id))}
                            >
                              <Text style={{ color: "#64748B", fontWeight: "600", fontSize: 12 }}>+ Add Extra</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={{ backgroundColor: "#F1F5F9", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center" }}>
                        ℹ️ Single variant product — only base ingredients needed.
                      </Text>
                    </View>
                  )}

                  {/* 💰 COST ANALYSIS PANEL */}
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#FDE68A", marginBottom: 14 }}>
                    <Text style={{ fontSize: 15, fontWeight: "bold", color: "#92400E", marginBottom: 10 }}>💰 Cost Analysis</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: "#78350F" }}>Recipe Cost:</Text>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#78350F" }}>{calculateRecipeCost(baseItems).toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: "#78350F" }}>Sale Price:</Text>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#78350F" }}>{getBasePrice().toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: "#78350F" }}>Profit:</Text>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#78350F" }}>{(getBasePrice() - calculateRecipeCost(baseItems)).toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                      <Text style={{ fontSize: 13, color: "#78350F" }}>Margin:</Text>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: getMarginColor(getBasePrice() > 0 ? ((getBasePrice() - calculateRecipeCost(baseItems)) / getBasePrice()) * 100 : 0) }}>
                        {getBasePrice() > 0 ? (((getBasePrice() - calculateRecipeCost(baseItems)) / getBasePrice()) * 100).toFixed(1) : "0"}% {getMarginLabel(getBasePrice() > 0 ? ((getBasePrice() - calculateRecipeCost(baseItems)) / getBasePrice()) * 100 : 0)}
                      </Text>
                    </View>

                    {(selectedProduct?.variants || []).length > 1 ? (
                      <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "#FDE68A", paddingTop: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: "bold", color: "#92400E", marginBottom: 6 }}>🔀 Variants:</Text>
                        {(selectedProduct?.variants || []).slice(1).map((variant) => {
                          const vItems = variantItems[String(variant.id)] || [];
                          const vCost = calculateRecipeCost(baseItems) + calculateRecipeCost(vItems);
                          const vPrice = getVariantPrice(variant.id);
                          const vMargin = vPrice > 0 ? ((vPrice - vCost) / vPrice) * 100 : 0;
                          return (
                            <View key={variant.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                              <Text style={{ fontSize: 11, color: "#78350F" }}>📦 {variant.name}: Cost {vCost.toFixed(0)} | Price {vPrice.toFixed(0)}</Text>
                              <Text style={{ fontSize: 11, fontWeight: "bold", color: getMarginColor(vMargin) }}>{vMargin.toFixed(0)}%</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={{ backgroundColor: "#43A047", borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: saving ? 0.6 : 1 }}
                    onPress={saveRecipe}
                    disabled={saving}
                  >
                    <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
                      {saving ? "⏳ Saving..." : "💾 Save Recipe"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================== INGREDIENT PICKER MODAL ==================== */}
      <Modal visible={ingredientPickerOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400, maxHeight: "70%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>
                📦 Select Ingredient
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                onPress={() => setIngredientPickerOpen(false)}
              >
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }}>
              {ingredients.length === 0 ? (
                <Text style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", paddingVertical: 20 }}>
                  No ingredients available. Add ingredients first.
                </Text>
              ) : (
                ingredients.map((ing) => (
                  <TouchableOpacity
                    key={ing.id}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}
                    onPress={() => addIngredientToRecipe(ing)}
                  >
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{ing.name}</Text>
                      <Text style={{ fontSize: 11, color: "#94A3B8" }}>
                        Stock: {Number(ing.current_stock).toFixed(1)} {ing.unit}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: "#E8590C", fontWeight: "bold" }}>+ Add</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================== ADD STOCK MODAL ==================== */}
      <Modal visible={Boolean(addStockModal)} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#0F172A", marginBottom: 12 }}>
              📦 Add Stock: {addStockModal?.name}
            </Text>
            <Text style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>
              Current: {Number(addStockModal?.current_stock || 0).toFixed(2)} {addStockModal?.unit}
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: "#F8FAFC", marginBottom: 8, color: "#0F172A" }}
              value={addStockQty}
              onChangeText={setAddStockQty}
              placeholder={`Quantity (${addStockModal?.unit || ""})`}
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
            />
            {addStockQty && Number(addStockQty) > 0 ? (
              <Text style={{ fontSize: 13, color: "#16A34A", marginBottom: 12 }}>
                New Stock: {(Number(addStockModal?.current_stock || 0) + Number(addStockQty)).toFixed(2)} {addStockModal?.unit}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                onPress={() => { setAddStockModal(null); setAddStockQty(""); }}
              >
                <Text style={{ color: "#64748B", fontWeight: "bold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "#0EA5E9", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                onPress={confirmAddStock}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== CALCULATE DEDUCTION MODAL ==================== */}
      <Modal visible={calculateModalOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#0F172A", marginBottom: 16 }}>🧮 Calculate Deduction</Text>
            {calculateData ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 14, color: "#334155", marginBottom: 8 }}>
                  📊 Orders since last calculation: <Text style={{ fontWeight: "bold" }}>{calculateData.order_count || 0}</Text>
                </Text>
                <Text style={{ fontSize: 14, color: "#334155", marginBottom: 8 }}>
                  🚫 Skipped (cancelled/refunded): <Text style={{ fontWeight: "bold" }}>{calculateData.skipped_count || 0}</Text>
                </Text>
                {calculateData.low_stock_warnings && calculateData.low_stock_warnings.length > 0 ? (
                  <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "bold", color: "#92400E", marginBottom: 6 }}>⚠️ Low Stock:</Text>
                    {calculateData.low_stock_warnings.map((w, idx) => (
                      <Text key={idx} style={{ fontSize: 12, color: "#78350F", marginBottom: 2 }}>
                        • {w.name} (have: {w.current}, need: {w.needed})
                      </Text>
                    ))}
                  </View>
                ) : (
                  <View style={{ backgroundColor: "#F0FDF4", borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <Text style={{ fontSize: 13, color: "#166534" }}>✅ All ingredients have enough stock</Text>
                  </View>
                )}
              </View>
            ) : (
              <ActivityIndicator size="large" color="#7C3AED" style={{ marginBottom: 14 }} />
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                onPress={() => { setCalculateModalOpen(false); setCalculateData(null); }}
              >
                <Text style={{ color: "#64748B", fontWeight: "bold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "#7C3AED", borderRadius: 8, paddingVertical: 12, alignItems: "center", opacity: calculating ? 0.6 : 1 }}
                onPress={confirmCalculate}
                disabled={calculating}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>{calculating ? "⏳..." : "✅ Confirm"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== EDIT INGREDIENT MODAL ==================== */}
      <Modal visible={editModalOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#0F172A", marginBottom: 16 }}>✏️ Edit Ingredient</Text>

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Name</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", marginBottom: 10, color: "#0F172A" }}
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Unit</Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {UNITS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: editUnit === u ? "#43A047" : "#fff",
                    borderWidth: 1,
                    borderColor: editUnit === u ? "#43A047" : "#CBD5E1"
                  }}
                  onPress={() => setEditUnit(u)}
                >
                  <Text style={{ color: editUnit === u ? "#fff" : "#64748B", fontWeight: "bold", fontSize: 12 }}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Stock</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", color: "#0F172A" }}
                  value={editStock}
                  onChangeText={setEditStock}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Min Stock</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", color: "#0F172A" }}
                  value={editMinStock}
                  onChangeText={setEditMinStock}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 }}>Cost per {editUnit}</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#F8FAFC", marginBottom: 16, color: "#0F172A" }}
              value={editCost}
              onChangeText={setEditCost}
              keyboardType="decimal-pad"
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                onPress={() => setEditModalOpen(false)}
              >
                <Text style={{ color: "#64748B", fontWeight: "bold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "#43A047", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
                onPress={saveEdit}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>💾 Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  const addKP = () => setKps([...kps, { id: "kp" + Date.now(), name: "Kitchen " + (kps.length + 1), enabled: true, connection: "network", paperSize: "80", address: "", port: "9100" }]);
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
      
      <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 18 }}>
        💡 Configure your kitchen printer here. Enter the printer IP address to send kitchen tickets to a separate printer. Receipt prints go to your browser's default printer.
      </Text>

      {kps.map((kp) => (
        <View key={kp.id} style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: "#F8FAFC" }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <TextInput style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: "#fff", color: "#0F172A", fontWeight: "bold" }} value={kp.name} onChangeText={(v) => updateKP(kp.id, { name: v })} placeholder="Kitchen 1" />
            <TouchableOpacity style={{ backgroundColor: kp.enabled === false ? "#94A3B8" : "#43A047", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }} onPress={() => updateKP(kp.id, { enabled: kp.enabled === false })}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>{kp.enabled === false ? "OFF" : "ON"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: "#0EA5E9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 }} onPress={() => testKP(kp)}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>🖨 Test</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 }} onPress={() => removeKP(kp.id)}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {["network", "browser"].map((c) => (
              <TouchableOpacity key={c} style={{ flex: 1, backgroundColor: kp.connection === c ? "#43A047" : "#fff", borderWidth: 1, borderColor: kp.connection === c ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingVertical: 8, alignItems: "center" }} onPress={() => updateKP(kp.id, { connection: c })}>
                <Text style={{ color: kp.connection === c ? "#fff" : "#64748B", fontWeight: "bold", fontSize: 12 }}>{c === "network" ? "🌐 NETWORK" : "🖥 BROWSER"}</Text>
              </TouchableOpacity>
            ))}
            {["58", "80"].map((s) => (
              <TouchableOpacity key={s} style={{ flex: 1, backgroundColor: kp.paperSize === s ? "#43A047" : "#fff", borderWidth: 1, borderColor: kp.paperSize === s ? "#43A047" : "#CBD5E1", borderRadius: 8, paddingVertical: 8, alignItems: "center" }} onPress={() => updateKP(kp.id, { paperSize: s })}>
                <Text style={{ color: kp.paperSize === s ? "#fff" : "#64748B", fontWeight: "bold", fontSize: 12 }}>{s}mm</Text>
              </TouchableOpacity>
            ))}
          </View>

          {kp.connection === "network" ? (
            <View>
              <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: "600" }}>🌐 Kitchen Printer IP & Port:</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput 
                  style={{ flex: 2, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff", color: "#0F172A" }} 
                  value={kp.address || ""} 
                  onChangeText={(v) => updateKP(kp.id, { address: v })} 
                  placeholder="192.168.1.100" 
                  placeholderTextColor="#94A3B8" 
                />
                <TextInput 
                  style={{ flex: 1, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: "#fff", color: "#0F172A" }} 
                  value={kp.port || "9100"} 
                  onChangeText={(v) => updateKP(kp.id, { port: v })} 
                  placeholder="9100" 
                  keyboardType="number-pad" 
                />
              </View>
              <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                💡 Find IP: Print a self-test page from your kitchen printer, or check router's connected devices.
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
              🖥 Browser mode: Kitchen tickets print to your system's default printer.
            </Text>
          )}
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

  const pickLogo = async (which) => {
    if (Platform.OS !== "web") {
      Alert.alert(t("upload"), "Web only.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        Alert.alert("⏳", "Uploading image...");
        const result = await uploadImage(file);
        if (which === "header") saveReceipt({ headerLogo: result.url });
        else saveReceipt({ footerLogo: result.url });
        Alert.alert("✅", "Image uploaded!");
      } catch (error) {
        Alert.alert("❌", error.message);
      }
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

        <Text style={styles.sectionTitle}>🍳 Recipe Tracking</Text>
        <RecipeTrackingCard />

        <Text style={styles.sectionTitle}>💰 Cash Drawer</Text>
        <CashDrawerCard />

        <Text style={styles.sectionTitle}>⚖️ Scale Barcode</Text>
        <ScaleBarcodeCard />

        <Text style={styles.sectionTitle}>🔌 Serial Scale (COM Port)</Text>
        <SerialScaleCard />

        <Text style={styles.sectionTitle}>{t("kitchenPrinter") || "Kitchen Printer"}</Text>
        <KitchenPrinterCard />

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
            {["network", "browser"].map((type) => (
              <TouchableOpacity key={type} style={[styles.optionButton, printer.connection === type && styles.optionButtonActive]} onPress={() => setPrinter({ connection: type })}>
                <Text style={[styles.optionText, printer.connection === type && styles.optionTextActive]}>
                  {type === "network" ? "🌐 NETWORK" : "🖥 BROWSER"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {printer.connection === "network" ? (
            <View>
              <Text style={styles.cardLabel}>{t("ipAddress")}</Text>
              <TextInput style={styles.input} value={printer.address || ""} onChangeText={(v) => setPrinter({ address: v })} placeholder="192.168.1.100" />
              <Text style={styles.cardLabel}>{t("port")}</Text>
              <TextInput style={styles.input} value={printer.port || "9100"} onChangeText={(v) => setPrinter({ port: v })} placeholder="9100" keyboardType="number-pad" />
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, marginBottom: 8 }}>
              🖥 Browser mode: Prints to your Windows default printer (USB receipt printer).
            </Text>
          )}

          <Text style={styles.cardLabel}>{t("paperSize")}</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionButton, printer.paperSize !== "58" && styles.optionButtonActive]} onPress={() => setPrinter({ paperSize: "80" })}>
              <Text style={[styles.optionText, printer.paperSize !== "58" && styles.optionTextActive]}>80mm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionButton, printer.paperSize === "58" && styles.optionButtonActive]} onPress={() => setPrinter({ paperSize: "58" })}>
              <Text style={[styles.optionText, printer.paperSize === "58" && styles.optionTextActive]}>58mm</Text>
            </TouchableOpacity>
          </View>

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
              <Text style={[styles.optionText, rc.paperSize !== "58" && styles.optionTextActive]}>80mm</Text>
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
              style={[styles.optionButton, (settings.receiptLanguage || "en") === "ar" && styles.optionButtonActive]}
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