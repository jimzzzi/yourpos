import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../api/client";

const RightsContext = createContext(null);

export function RightsProvider({ children }) {
  const { user } = useAuth();
  const [rights, setRights] = useState(null);

  useEffect(() => {
  if (!user) {
    setRights(null);
    return;
  }
  (async () => {
    try {
      const r = await api.get("/users/me");
      console.log("🔐 RIGHTS LOADED:", r.data);
      setRights(r.data);
    } catch (e) {
      console.error("🔐 RIGHTS ERROR:", e);
      // DO NOT default to owner! Hide everything if it fails.
      setRights({ is_owner: false, permissions: [], error: true });
    }
  })();
}, [user]);
  const can = (right) => {
  if (!rights) return false; // Hide everything until loaded
  if (rights.is_owner) return true;
  return (rights.permissions || []).includes(right);
};

  return <RightsContext.Provider value={{ rights, can }}>{children}</RightsContext.Provider>;
}

export function useRights() {
  return useContext(RightsContext);
}