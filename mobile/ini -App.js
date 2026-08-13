import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from "react-native";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { SettingsProvider } from "./src/context/SettingsContext";
import ErrorBoundary from "./src/components/ErrorBoundary";
import AuthScreen from "./src/screens/AuthScreen";
import POSHomeScreen from "./src/screens/POSHomeScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import OrdersScreen from "./src/screens/OrdersScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ModifiersScreen from "./src/screens/ModifiersScreen";
import BackOfficeScreen from "./src/screens/BackOfficeScreen";
import { useOfflineSync } from "./src/hooks/useOfflineSync";

function SplashLoading() {
  return (
    <View style={styles.splash}>
      <Text style={styles.splashText}>Loading YourPOS...</Text>
    </View>
  );
}

function SyncController() {
  const { user } = useAuth();
  useOfflineSync(Boolean(user));
  return null;
}

const MENU_ITEMS = [
  { key: "pos", label: "Sales", icon: "🛒" },
  { key: "orders", label: "Receipts", icon: "🧾" },
  { key: "inventory", label: "Items", icon: "📦" },
  { key: "modifiers", label: "Modifiers", icon: "🧂" },
  { key: "backoffice", label: "Back Office", icon: "📊" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

function Drawer({ visible, activeScreen, onNavigate, onClose }) {
  const { user, store, logout } = useAuth();

  if (!visible) return null;

  return (
    <View style={styles.drawerOverlay}>
      <TouchableOpacity style={styles.drawerBackdrop} onPress={onClose} activeOpacity={1} />
      <View style={styles.drawer}>
        <View style={styles.drawerHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.drawerUserName}>{user ? user.name : ""}</Text>
            <Text style={styles.drawerSub}>{store ? store.name : ""}</Text>
          </View>
          <TouchableOpacity style={styles.lockButton} onPress={logout}>
            <Text style={styles.lockIcon}>🔒</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.drawerBody}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.drawerItem, activeScreen === item.key && styles.drawerItemActive]}
              onPress={() => onNavigate(item.key)}
            >
              <Text style={styles.drawerItemIcon}>{item.icon}</Text>
              <Text style={[styles.drawerItemLabel, activeScreen === item.key && styles.drawerItemLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function MainApp() {
  const { store } = useAuth();
  const [activeScreen, setActiveScreen] = useState("pos");
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={() => setDrawerVisible(true)}>
          <Text style={styles.menuButtonIcon}>⋮</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {store ? store.name : "YourPOS"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {activeScreen === "pos" && <POSHomeScreen />}
        {activeScreen === "orders" && <OrdersScreen />}
        {activeScreen === "inventory" && <InventoryScreen />}
        {activeScreen === "modifiers" && <ModifiersScreen />}
        {activeScreen === "backoffice" && <BackOfficeScreen />}
        {activeScreen === "settings" && <SettingsScreen />}
      </View>

      <Drawer
        visible={drawerVisible}
        activeScreen={activeScreen}
        onNavigate={(key) => {
          setActiveScreen(key);
          setDrawerVisible(false);
        }}
        onClose={() => setDrawerVisible(false)}
      />
    </SafeAreaView>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <SplashLoading />;
  if (!user) return <AuthScreen />;
  return <MainApp />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <SyncController />
          <RootNavigator />
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  splash: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0F172A" },
  splashText: { color: "#fff", fontSize: 18 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#43A047" },
  menuButton: { width: 40, height: 40, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  menuButtonIcon: { color: "#fff", fontSize: 26, fontWeight: "bold" },
  headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontWeight: "bold", marginLeft: 8 },
  headerSpacer: { width: 40 },
  content: { flex: 1 },
  drawerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  drawerBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  drawer: {
    position: "absolute", top: 0, left: 0, bottom: 0, width: 300, maxWidth: "85%",
    backgroundColor: "#ECEFF1", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 10,
  },
  drawerHeader: { flexDirection: "row", alignItems: "center", backgroundColor: "#43A047", paddingHorizontal: 20, paddingTop: 30, paddingBottom: 20 },
  drawerUserName: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  drawerSub: { color: "#DCEDC8", fontSize: 14, marginTop: 4 },
  lockButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  lockIcon: { fontSize: 20 },
  drawerBody: { flex: 1, paddingTop: 10 },
  drawerItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, marginHorizontal: 8, marginVertical: 2, borderRadius: 6 },
  drawerItemActive: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#43A047" },
  drawerItemIcon: { fontSize: 20, marginRight: 16 },
  drawerItemLabel: { fontSize: 16, color: "#37474F", fontWeight: "600" },
  drawerItemLabelActive: { color: "#0F172A", fontWeight: "bold" },
});
