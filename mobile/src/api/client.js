import axios from "axios";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Get the current hostname dynamically
const getBaseUrl = () => {
  if (typeof window !== "undefined" && window.location) {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const url = `${protocol}//${hostname}:4000/api`;
    console.log("🔌 API Base URL (dynamic):", url);
    return url;
  }
  console.log("🔌 API Base URL (fallback):", "http://localhost:4000/api");
  return "http://localhost:4000/api";
};

export const API_URL = process.env.EXPO_PUBLIC_API_URL || getBaseUrl();

// Debug: log the final URL being used
console.log("🔌 Final API URL:", API_URL);

const TOKEN_KEY = "yourpos_auth_token";

export async function getToken() {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    return null;
  }
}

export async function setToken(token) {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {}
}

export async function clearToken() {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {}
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = "Bearer " + token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      await clearToken();
    }
    return Promise.reject(error);
  }
);

// ===== OFFLINE MIRROR: auto-caches GET requests, serves cache when offline =====
const MIRROR_PREFIX = "yourpos_mirror:";

function readMirror(cfg) {
  try {
    const raw = localStorage.getItem(MIRROR_PREFIX + (cfg.url || ""));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeMirror(cfg, data) {
  try {
    localStorage.setItem(MIRROR_PREFIX + (cfg.url || ""), JSON.stringify(data));
  } catch (e) {
    try {
      const slim = Array.isArray(data) ? data.map((d) => (d && typeof d === "object" ? { ...d, photo: "", image: "" } : d)) : data;
      localStorage.setItem(MIRROR_PREFIX + (cfg.url || ""), JSON.stringify(slim));
    } catch (e2) {}
  }
}

api.interceptors.response.use(
  (response) => {
    if (response && response.config && response.config.method === "get") {
      writeMirror(response.config, response.data);
    }
    return response;
  },
  (error) => {
    const cfg = error && error.config;
    if (cfg && cfg.method === "get" && !error.response) {
      const cached = readMirror(cfg);
      if (cached !== null) {
        return Promise.resolve({ data: cached, status: 200, statusText: "offline-mirror", headers: {}, config: cfg });
      }
    }
    return Promise.reject(error);
  }
);