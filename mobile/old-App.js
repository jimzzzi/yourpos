import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import AuthScreen from "./src/screens/AuthScreen";
import POSHomeScreen from "./src/screens/POSHomeScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import OrdersScreen from "./src/screens/OrdersScreen";
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

function MainApp() {
  const { user, store, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("pos");

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerStore}>{store ? store.name : "My Store"}</Text>
          <Text style={styles.headerUser}>{user.email}</Text>
        </View>

        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "pos" && styles.tabButtonActive]}
          onPress={() => setActiveTab("pos")}
        >
          <Text style={[styles.tabButtonText, activeTab === "pos" && styles.tabButtonTextActive]}>
            POS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "inventory" && styles.tabButtonActive]}
          onPress={() => setActiveTab("inventory")}
        >
          <Text style={[styles.tabButtonText, activeTab === "inventory" && styles.tabButtonTextActive]}>
            Inventory
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "orders" && styles.tabButtonActive]}
          onPress={() => setActiveTab("orders")}
        >
          <Text style={[styles.tabButtonText, activeTab === "orders" && styles.tabButtonTextActive]}>
            Orders
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "pos" ? (
        <POSHomeScreen />
      ) : activeTab === "inventory" ? (
        <InventoryScreen />
      ) : (
        <OrdersScreen />
      )}
    </View>
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
    <AuthProvider>
      <SyncController />
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" },
  splashText: { color: "#fff", fontSize: 18 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0f172a",
  },
  headerStore: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  headerUser: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  logoutButton: { color: "#f87171", fontSize: 14, fontWeight: "bold" },
  tabBar: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  tabButton: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabButtonActive: { borderBottomWidth: 3, borderBottomColor: "#2563eb" },
  tabButtonText: { color: "#64748b", fontWeight: "600" },
  tabButtonTextActive: { color: "#2563eb" },
});
