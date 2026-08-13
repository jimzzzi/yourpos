import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { api, getToken, setToken, clearToken } from "../api/client";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

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
        const response = await api.get("/auth/me");
        setUser(response.data.user);
        setStore(response.data.store);
        await refreshStore();
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

  const login = async (email, password) => {
    const response = await api.post("/auth/login", { email, password });
    const { token, user, store } = response.data;
    await setToken(token);
    setUser(user);
    setStore(store);
    return response.data;
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
    return response.data;
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
    setStore(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, store, loading, login, register, logout, refreshStore }}
    >
      {children}
    </AuthContext.Provider>
  );
}
