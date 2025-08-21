import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export { useTranslation };
export default i18n;
