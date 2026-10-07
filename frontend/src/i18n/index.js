import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import uz from "./uz";
import ru from "./ru";
import en from "./en";

const saved = (() => { try { return localStorage.getItem("rv_lang"); } catch { return null; } })();
i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru }, en: { translation: en } },
  lng: saved || "uz",
  fallbackLng: "uz",
  interpolation: { escapeValue: false },
  returnObjects: true,
});
export default i18n;
