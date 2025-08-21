import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";

const storedLng =
  typeof window !== "undefined" ? localStorage.getItem("language") || "en" : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: storedLng,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export { useTranslation };
export default i18n;
