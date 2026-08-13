import React, { createContext, useContext } from "react";
import { useSettings } from "../context/SettingsContext";
import { TRANSLATIONS } from "./translations";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const { settings, updateSettings } = useSettings();
  const lang = settings.language || "en";
  const custom = (settings.customTranslations && settings.customTranslations[lang]) || {};

  const t = (key) => {
    if (custom[key]) return custom[key];
    const dict = TRANSLATIONS[lang];
    if (dict && dict[key]) return dict[key];
    return TRANSLATIONS.en[key] || key;
  };

  const dir = lang === "ar" ? "rtl" : "ltr";
  const setLanguage = (code) => updateSettings({ language: code });

  return (
    <I18nContext.Provider value={{ lang, dir, t, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}