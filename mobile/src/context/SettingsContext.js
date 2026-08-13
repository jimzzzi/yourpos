import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SettingsContext = createContext(null);

export const useSettings = () => useContext(SettingsContext);

const defaultSettings = {
  productLayout: "grid",
  darkMode: false,
  diningEnabled: false,
  tablesEnabled: false,
  gridColumns: 3,
  printer: {
    enabled: true,
    connection: "network",
    address: "192.168.0.100",
    port: "9100",
    deviceName: "EPSON TM-T20",
  },
  receipt: {
    headerText: "Thank you for your purchase!",
    footerText: "Powered by YourPOS",
    showTax: true,
    paperSize: "80",
  },
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("@yourpos_settings");
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettings({
            ...defaultSettings,
            ...parsed,
            printer: { ...defaultSettings.printer, ...(parsed.printer || {}) },
            receipt: { ...defaultSettings.receipt, ...(parsed.receipt || {}) },
          });
        }
      } catch (error) {}
    })();
  }, []);

  const updateSettings = async (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem("@yourpos_settings", JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}