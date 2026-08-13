import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isLogin = mode === "login";

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
  };

  const validate = () => {
    if (!isLogin && name.trim().length === 0) {
      setError(t("errName"));
      return false;
    }
    if (!isLogin && storeName.trim().length === 0) {
      setError(t("errStore"));
      return false;
    }
    if (!email.includes("@")) {
      setError(t("errEmail"));
      return false;
    }
    if (password.length < 8) {
      setError(t("errPassword"));
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError("");
    if (!validate()) return;
    setLoading(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register({ name: name.trim(), email: email.trim(), password, storeName: storeName.trim() });
      }
    } catch (err) {
      const message = err.response?.data?.error || "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>YourPOS</Text>
            <Text style={styles.subtitle}>{t("tagline")}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>{isLogin ? t("welcomeBack") : t("createFreeAccount")}</Text>
            {!isLogin && (
              <>
                <Text style={styles.label}>{t("yourName")}</Text>
                <TextInput style={styles.input} placeholder="John Doe" value={name} onChangeText={setName} autoCapitalize="words" />
                <Text style={styles.label}>{t("storeNamePh")}</Text>
                <TextInput style={styles.input} placeholder="My Coffee Shop" value={storeName} onChangeText={setStoreName} autoCapitalize="words" />
              </>
            )}
            <Text style={styles.label}>{t("email")}</Text>
            <TextInput style={styles.input} placeholder="owner@store.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.label}>{t("password")}</Text>
            <TextInput style={styles.input} placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isLogin ? t("login") : t("createAccount")}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.switchButton} onPress={() => switchMode(isLogin ? "register" : "login")}>
              <Text style={styles.switchText}>{isLogin ? t("noAccountRegister") : t("haveAccountLogin")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoContainer: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 36, fontWeight: "bold", color: "#fff" },
  subtitle: { marginTop: 8, color: "#94a3b8", textAlign: "center", fontSize: 14 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 520, alignSelf: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 16, color: "#0f172a" },
  label: { fontSize: 14, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#f8fafc" },
  button: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  switchButton: { marginTop: 16, alignItems: "center" },
  switchText: { color: "#2563eb", fontWeight: "600" },
  error: { marginTop: 14, color: "#dc2626", fontSize: 14 },
});