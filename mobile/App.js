import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from "react-native";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { RightsProvider, useRights } from "./src/auth/RightsContext";
import { SettingsProvider, useSettings } from "./src/context/SettingsContext";
import { I18nProvider, useI18n } from "./src/i18n/I18nContext";
import { getPalette } from "./src/theme";
import ErrorBoundary from "./src/components/ErrorBoundary";
import AuthScreen from "./src/screens/AuthScreen";
import POSHomeScreen from "./src/screens/POSHomeScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import OrdersScreen from "./src/screens/OrdersScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ModifiersScreen from "./src/screens/ModifiersScreen";
import BackOfficeScreen from "./src/screens/BackOfficeScreen";
import TablesScreen from "./src/screens/TablesScreen";
import ImportExportScreen from "./src/screens/ImportExportScreen";
import LanguageScreen from "./src/screens/LanguageScreen";
import UsersScreen from "./src/screens/UsersScreen";
import { useOfflineSync } from "./src/hooks/useOfflineSync";
import CustomerMenuScreen from "./src/screens/CustomerMenuScreen";
import CustomerTakeawayScreen from "./src/screens/CustomerTakeawayScreen"; // 🥡 NEW
import TakeawayScreen from "./src/screens/TakeawayScreen";

function SplashLoading() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0F172A" }}>
      <Text style={{ color: "#fff", fontSize: 18 }}>Loading YourPOS...</Text>
    </View>
  );
}

function SyncController() {
  const { user } = useAuth();
  useOfflineSync(Boolean(user));
  return null;
}

const MENU_ITEMS = [
  { key: "pos", labelKey: "sales", icon: "🛒", right: "sales" },
  { key: "takeaway", labelKey: "takeaway", icon: "🥡", right: "sales" },
  { key: "orders", labelKey: "receipts", icon: "🧾", right: "receipts" },
  { key: "inventory", labelKey: "items", icon: "📦", right: "items" },
  { key: "modifiers", labelKey: "modifiers", icon: "🧂", right: "items" },
  { key: "tables", labelKey: "tables", icon: "🪑", right: "sales" },
  { key: "importexport", labelKey: "importExport", icon: "📤", right: "items" },
  { key: "backoffice", labelKey: "backOffice", icon: "📊", right: "reports" },
  { key: "users", labelKey: "usersRights", icon: "👥", right: "users" },
  { key: "languages", labelKey: "languages", icon: "🌐", right: null },
  { key: "settings", labelKey: "settings", icon: "⚙️", right: "settings" },
];

function makeStyles(p) {
  return {
    container: { flex: 1, backgroundColor: p.bg },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#0F172A" },
    menuButton: { width: 40, height: 40, borderRadius: 8, justifyContent: "center", alignItems: "center" },
    menuButtonIcon: { color: "#fff", fontSize: 26, fontWeight: "bold" },
    headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontWeight: "bold", marginLeft: 8 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
    clockBox: { alignItems: "flex-end" },
    clockTime: { color: "#7BD88A", fontSize: 17, fontWeight: "bold", fontFamily: "Courier New", letterSpacing: 1 },
    clockDay: { color: "#94A3B8", fontSize: 10, marginTop: 1 },
    userChip: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 150 },
    userChipIcon: { fontSize: 12, marginRight: 6 },
    userChipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
    content: { flex: 1 },
    drawerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
    drawerBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
    drawer: { position: "absolute", top: 0, left: 0, bottom: 0, width: 300, maxWidth: "85%", backgroundColor: p.surface, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
    drawerHeader: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F172A", paddingHorizontal: 20, paddingTop: 30, paddingBottom: 20 },
    drawerUserName: { color: "#fff", fontSize: 20, fontWeight: "bold" },
    drawerSub: { color: "#94A3B8", fontSize: 14, marginTop: 4 },
    lockButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
    lockIcon: { fontSize: 20 },
    drawerBody: { flex: 1, paddingTop: 10 },
    drawerItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, marginHorizontal: 8, marginVertical: 2, borderRadius: 6 },
    drawerItemActive: { backgroundColor: p.surface2, borderWidth: 1, borderColor: p.accent },
    drawerItemIcon: { fontSize: 20, marginRight: 16 },
    drawerItemLabel: { fontSize: 16, color: p.muted, fontWeight: "600" },
    drawerItemLabelActive: { color: p.text, fontWeight: "bold" },
  };
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const styles = makeStyles(getPalette(false));
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const day = now.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return (
    <View style={styles.clockBox}>
      <Text style={styles.clockTime}>{time}</Text>
      <Text style={styles.clockDay}>{day}</Text>
    </View>
  );
}

function Drawer({ visible, activeScreen, onNavigate, onClose }) {
  const { user, store, logout } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const { rights, can } = useRights();
  const styles = makeStyles(getPalette(settings.darkMode));

  if (!visible) return null;

  // Don't show menu until rights are loaded
  if (!rights) {
    return (
      <View style={styles.drawerOverlay}>
        <TouchableOpacity style={styles.drawerBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.drawer}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: "#64748B" }}>Loading...</Text>
          </View>
        </View>
      </View>
    );
  }

  const items = MENU_ITEMS.filter((m) => {
    if (!m.right) return true;
    const allowed = can(m.right);
    console.log(`[MENU] ${m.key}: right=${m.right}, allowed=${allowed}`);
    return allowed;
  });

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
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.drawerItem, activeScreen === item.key && styles.drawerItemActive]}
              onPress={() => onNavigate(item.key)}
            >
              <Text style={styles.drawerItemIcon}>{item.icon}</Text>
              <Text style={[styles.drawerItemLabel, activeScreen === item.key && styles.drawerItemLabelActive]}>
                {t(item.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function MainApp() {
  const { store, user } = useAuth();
  const { settings } = useSettings();
  const { dir } = useI18n();
  const styles = makeStyles(getPalette(settings.darkMode));
  const [activeScreen, setActiveScreen] = useState("pos");
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { direction: dir }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={() => setDrawerVisible(true)}>
          <Text style={styles.menuButtonIcon}>⋮</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {store ? store.name : "YourPOS"}
        </Text>
        <View style={styles.headerRight}>
          <LiveClock />
          <View style={styles.userChip}>
            <Text style={styles.userChipIcon}>👤</Text>
            <Text style={styles.userChipText} numberOfLines={1}>{user ? user.name : ""}</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        {activeScreen === "pos" && <POSHomeScreen />}
		{activeScreen === "takeaway" && <TakeawayScreen />}
        {activeScreen === "orders" && <OrdersScreen />}
        {activeScreen === "inventory" && <InventoryScreen />}
        {activeScreen === "modifiers" && <ModifiersScreen />}
        {activeScreen === "tables" && <TablesScreen />}
        {activeScreen === "importexport" && <ImportExportScreen />}
        {activeScreen === "users" && <UsersScreen />}
        {activeScreen === "languages" && <LanguageScreen />}
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
  
  // Read QR param IMMEDIATELY - no login needed for customers
  const qrTableId = React.useMemo(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qrParam = params.get("qr");
      if (qrParam) return parseInt(qrParam);
    }
    return null;
  }, []);

  // 🥡 Read Takeaway param - no login needed for customers
  const takeawayStoreId = React.useMemo(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const takeawayParam = params.get("takeaway");
      if (takeawayParam) return parseInt(takeawayParam);
    }
    return null;
  }, []);

  if (loading) return <SplashLoading />;
  
  // QR menu is PUBLIC - customers don't need to login!
  if (qrTableId) {
    return <CustomerMenuScreen tableId={qrTableId} />;
  }

  // 🥡 Takeaway menu is PUBLIC - customers don't need to login!
  if (takeawayStoreId) {
    return <CustomerTakeawayScreen storeId={takeawayStoreId} />;
  }
  
  if (!user) return <AuthScreen />;
  return <MainApp />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <I18nProvider>
            <RightsProvider>
              <SyncController />
              <RootNavigator />
            </RightsProvider>
          </I18nProvider>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}