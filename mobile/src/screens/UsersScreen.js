import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { usersApi } from "../api/users";
import { useAuth } from "../auth/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useI18n } from "../i18n/I18nContext";
import { getPalette } from "../theme";

const RIGHTS = ["sales", "refunds", "discounts", "items", "receipts", "reports", "cash", "settings", "users"];

function makeStyles(p) {
  return {
    container: { flex: 1, backgroundColor: p.bg },
    content: { padding: 16, width: "100%", maxWidth: 800, alignSelf: "center" },
    title: { fontSize: 22, fontWeight: "bold", color: p.text, marginBottom: 12 },
    tabRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    tab: { flex: 1, borderWidth: 2, borderColor: p.border, borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: p.surface },
    tabActive: { backgroundColor: p.accent, borderColor: p.accent },
    tabText: { color: p.muted, fontWeight: "bold" },
    tabTextActive: { color: "#fff" },
    card: { backgroundColor: p.surface, borderRadius: 12, borderWidth: 1, borderColor: p.border, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 16, fontWeight: "bold", color: p.text, marginBottom: 10 },
    label: { fontSize: 13, fontWeight: "600", color: p.muted, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: p.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: p.input, color: p.text, marginBottom: 8 },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    chip: { borderWidth: 1, borderColor: p.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: p.surface2 },
    chipActive: { backgroundColor: p.accent, borderColor: p.accent },
    chipText: { color: p.muted, fontWeight: "600", fontSize: 12 },
    chipTextActive: { color: "#fff" },
    button: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 6 },
    buttonText: { color: "#fff", fontWeight: "bold" },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border },
    rowInfo: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: "bold", color: p.text },
    rowSub: { fontSize: 12, color: p.muted, marginTop: 2 },
    badge: { backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
    badgeText: { color: p.muted, fontSize: 11, fontWeight: "bold" },
    actionBtns: { flexDirection: "row", gap: 8 },
    editBtn: { backgroundColor: "#0EA5E9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
    deleteBtn: { backgroundColor: p.dangerBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
    actionText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
    deleteText: { color: p.dangerText, fontWeight: "bold", fontSize: 12 },
    center: { paddingVertical: 40, alignItems: "center" },
  };
}

export default function UsersScreen() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { t } = useI18n();
  const p = getPalette(settings.darkMode);
  const styles = makeStyles(p);

  const [tab, setTab] = useState("groups");
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [gName, setGName] = useState("");
  const [gPerms, setGPerms] = useState(["sales"]);
  const [editingGroup, setEditingGroup] = useState(null);

  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPass, setUPass] = useState("");
  const [uGroup, setUGroup] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [g, u] = await Promise.all([usersApi.getGroups(), usersApi.getUsers()]);
      setGroups(g || []);
      setUsers(u || []);
    } catch (e) {
      window.alert("Load failed: " + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePerm = (r) =>
    setGPerms((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const openEditGroup = (g) => {
    setEditingGroup(g);
    setGName(g.name);
    setGPerms(g.permissions || ["sales"]);
  };

  const cancelEditGroup = () => {
    setEditingGroup(null);
    setGName("");
    setGPerms(["sales"]);
  };

  const createOrUpdateGroup = async () => {
    if (!gName.trim()) return window.alert(t("groupName") + "!");
    try {
      if (editingGroup) {
        await usersApi.updateGroup(editingGroup.id, { name: gName.trim(), permissions: gPerms });
        window.alert("✅ Updated " + gName.trim());
      } else {
        await usersApi.createGroup({ name: gName.trim(), permissions: gPerms });
        window.alert("✅ Created " + gName.trim());
      }
      cancelEditGroup();
      await load();
    } catch (e) {
      window.alert("❌ " + (e.response?.data?.error || e.message));
    }
  };

  const deleteGroup = (g) => {
    if (!window.confirm(t("delete") + " \"" + g.name + "\"?")) return;
    (async () => {
      try {
        await usersApi.deleteGroup(g.id);
        window.alert("🗑 ✅");
        await load();
      } catch (e) {
        window.alert("❌ " + (e.response?.data?.error || e.message));
      }
    })();
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setUName(u.name);
    setUEmail(u.email);
    setUPass("");
    setUGroup(u.group_id);
  };

  const cancelEditUser = () => {
    setEditingUser(null);
    setUName("");
    setUEmail("");
    setUPass("");
    setUGroup(null);
  };

  const createOrUpdateUser = async () => {
    if (!uName.trim()) return window.alert(t("yourName") + "!");
    if (!uEmail.includes("@")) return window.alert(t("errEmail"));
    if (editingUser && !uPass) {
      // Update without password change
      try {
        await usersApi.updateUser(editingUser.id, { name: uName.trim(), email: uEmail.trim(), group_id: uGroup });
        window.alert("✅ Updated " + uName.trim());
        cancelEditUser();
        await load();
      } catch (e) {
        window.alert("❌ " + (e.response?.data?.error || e.message));
      }
      return;
    }
    if (uPass.length < 8) return window.alert(t("errPassword"));
    try {
      if (editingUser) {
        await usersApi.updateUser(editingUser.id, { name: uName.trim(), email: uEmail.trim(), password: uPass, group_id: uGroup });
        window.alert("✅ Updated " + uName.trim());
      } else {
        await usersApi.createUser({ name: uName.trim(), email: uEmail.trim(), password: uPass, group_id: uGroup });
        window.alert("✅ Created " + uName.trim());
      }
      cancelEditUser();
      await load();
    } catch (e) {
      window.alert("❌ " + (e.response?.data?.error || e.message));
    }
  };

  const deleteUser = (u) => {
    if (!window.confirm(t("delete") + " \"" + u.name + "\"?")) return;
    (async () => {
      try {
        await usersApi.deleteUser(u.id);
        window.alert("🗑 ✅");
        await load();
      } catch (e) {
        window.alert("❌ " + (e.response?.data?.error || e.message));
      }
    })();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>👥 {t("usersRights")}</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === "groups" && styles.tabActive]} onPress={() => setTab("groups")}>
          <Text style={[styles.tabText, tab === "groups" && styles.tabTextActive]}>{t("groupsTab")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "users" && styles.tabActive]} onPress={() => setTab("users")}>
          <Text style={[styles.tabText, tab === "users" && styles.tabTextActive]}>{t("usersTab")}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={p.accent} /></View>
      ) : tab === "groups" ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editingGroup ? "Edit Group" : t("createGroup")}</Text>
            <TextInput style={styles.input} value={gName} onChangeText={setGName} placeholder={t("groupName")} placeholderTextColor={p.muted} />
            <Text style={styles.label}>{t("rightsLabel")}</Text>
            <View style={styles.chipWrap}>
              {RIGHTS.map((r) => (
                <TouchableOpacity key={r} style={[styles.chip, gPerms.includes(r) && styles.chipActive]} onPress={() => togglePerm(r)}>
                  <Text style={[styles.chipText, gPerms.includes(r) && styles.chipTextActive]}>{t("right_" + r)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={createOrUpdateGroup}>
                <Text style={styles.buttonText}>{editingGroup ? "Update" : t("createGroup")}</Text>
              </TouchableOpacity>
              {editingGroup ? (
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border }]} onPress={cancelEditGroup}>
                  <Text style={{ color: p.text, fontWeight: "bold" }}>{t("cancel")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {groups.map((g) => (
            <View key={g.id} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>👥 {g.name}</Text>
                  <Text style={styles.rowSub}>
                    {(g.permissions || []).map((r) => t("right_" + r)).join(" • ") || "—"}
                  </Text>
                </View>
                <View style={styles.actionBtns}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEditGroup(g)}>
                    <Text style={styles.actionText}>{t("edit")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteGroup(g)}>
                    <Text style={styles.deleteText}>{t("delete")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editingUser ? "Edit User" : t("addUser")}</Text>
            <TextInput style={styles.input} value={uName} onChangeText={setUName} placeholder={t("yourName")} placeholderTextColor={p.muted} />
            <TextInput style={styles.input} value={uEmail} onChangeText={setUEmail} placeholder={t("email")} placeholderTextColor={p.muted} autoCapitalize="none" />
            <TextInput 
              style={styles.input} 
              value={uPass} 
              onChangeText={setUPass} 
              placeholder={editingUser ? t("password") + " (leave blank to keep)" : t("password") + " (8+)"} 
              placeholderTextColor={p.muted} 
              secureTextEntry 
            />
            <Text style={styles.label}>{t("groupsTab")}</Text>
            <View style={styles.chipWrap}>
              <TouchableOpacity style={[styles.chip, uGroup === null && styles.chipActive]} onPress={() => setUGroup(null)}>
                <Text style={[styles.chipText, uGroup === null && styles.chipTextActive]}>{t("noGroup")}</Text>
              </TouchableOpacity>
              {groups.map((g) => (
                <TouchableOpacity key={g.id} style={[styles.chip, uGroup === g.id && styles.chipActive]} onPress={() => setUGroup(g.id)}>
                  <Text style={[styles.chipText, uGroup === g.id && styles.chipTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={createOrUpdateUser}>
                <Text style={styles.buttonText}>{editingUser ? "Update" : t("addUser")}</Text>
              </TouchableOpacity>
              {editingUser ? (
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border }]} onPress={cancelEditUser}>
                  <Text style={{ color: p.text, fontWeight: "bold" }}>{t("cancel")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {users.map((u) => (
            <View key={u.id} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>
                    👤 {u.name}
                    {Number(u.id) === Number(user.id) ? " (" + t("youBadge") + ")" : ""}
                  </Text>
                  <Text style={styles.rowSub}>{u.email}</Text>
                  <View style={{ flexDirection: "row", marginTop: 6 }}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {u.is_owner ? t("ownerBadge") : u.group_name || t("noGroup")}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.actionBtns}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEditUser(u)}>
                    <Text style={styles.actionText}>{t("edit")}</Text>
                  </TouchableOpacity>
                  {!u.is_owner ? (
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteUser(u)}>
                      <Text style={styles.deleteText}>{t("delete")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}