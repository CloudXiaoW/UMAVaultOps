import { createI18n } from "vue-i18n";
import en from "./en";
import zh from "./zh";

const saved = localStorage.getItem("ops-lang") ?? "zh";

export const i18n = createI18n({
  legacy: false,
  locale: saved,
  fallbackLocale: "en",
  messages: { en, zh },
});
