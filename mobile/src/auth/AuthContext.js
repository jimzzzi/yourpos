import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Platform } from "react-native";
import { api, getToken, setToken, clearToken } from "../api/client";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const PASSPORT_KEY = "yourpos_offline_passport";

async function hashText(text) {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) {}
  let h = 0;
  for (let i = 0; i < text.length; i++) { h = (h << 5) - h + text.charCodeAt(i); h |= 0; }
  return "s" + String(h);
}

function readPassport() {
  try {
    const raw = localStorage.getItem(PASSPORT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writePassport(p) {
  try { localStorage.setItem(PASSPORT_KEY, JSON.stringify(p)); } catch (e) {}
}

const isNetworkError = (e) => !e || !e.response;

function OfflineBanner({ offline }) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(window.navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (typeof window === "undefined" || Platform.OS !== "web") return null;
  if (online && !offline) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "#B45309", color: "#fff", textAlign: "center", padding: "6px 10px", fontWeight: "bold", fontSize: 12 }}>
      📴 OFFLINE MODE — sales continue & will sync when internet returns
    </div>
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refreshStore = useCallback(async () => {
    try {
      const response = await api.get("/store");
      setStore(response.data);
    } catch (error) {}
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) {
        try {
          const response = await api.get("/auth/me");
          setUser(response.data.user);
          setStore(response.data.store);
          setOffline(false);
          await refreshStore();
        } catch (inner) {
          if (isNetworkError(inner)) {
            const p = readPassport();
            if (p) {
              await setToken(p.token);
              setUser(p.user);
              setStore(p.store);
              setOffline(true);
            } else {
              await clearToken();
              setUser(null);
              setStore(null);
            }
          } else {
            await clearToken();
            setUser(null);
            setStore(null);
          }
        }
      }
    } catch (error) {
      await clearToken();
      setUser(null);
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, [refreshStore]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // When internet returns, silently go back online
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = async () => {
      if (offline) {
        try {
          const r = await api.get("/auth/me");
          setUser(r.data.user);
          setStore(r.data.store);
          setOffline(false);
          await refreshStore();
        } catch (e) {}
      }
    };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [offline, refreshStore]);

  const login = async (email, password) => {
    try {
      const response = await api.post("/auth/login", { email, password });
      const { token, user, store } = response.data;
      await setToken(token);
      setUser(user);
      setStore(store);
      setOffline(false);
      const passHash = await hashText(String(email).toLowerCase() + "::" + password);
      writePassport({ email: String(email).toLowerCase(), token, user, store, passHash, savedAt: Date.now() });
      return response.data;
    } catch (error) {
      if (isNetworkError(error)) {
        const p = readPassport();
        if (p && p.email === String(email).toLowerCase()) {
          const passHash = await hashText(String(email).toLowerCase() + "::" + password);
          if (passHash === p.passHash) {
            await setToken(p.token);
            setUser(p.user);
            setStore(p.store);
            setOffline(true);
            return { token: p.token, user: p.user, store: p.store, offline: true };
          }
          throw new Error("Wrong password (offline check).");
        }
        throw new Error("No internet and no saved login on this device.");
      }
      throw error;
    }
  };

  const register = async ({ name, email, password, storeName }) => {
    const response = await api.post("/auth/register", {
      name,
      email,
      password,
      storeName,
    });
    const { token, user, store } = response.data;
    await setToken(token);
    setUser(user);
    setStore(store);
    setOffline(false);
    const passHash = await hashText(String(email).toLowerCase() + "::" + password);
    writePassport({ email: String(email).toLowerCase(), token, user, store, passHash, savedAt: Date.now() });
    return response.data;
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
    setStore(null);
    setOffline(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, store, loading, login, register, logout, refreshStore, offline }}
    >
      {children}
      <OfflineBanner offline={offline} />
    </AuthContext.Provider>
  );
}