import { normalizeLang, type Lang } from "./i18n";

let currentLanguage: Lang = "en";

export function getCurrentLanguage(): Lang {
  return currentLanguage;
}

export function setCurrentLanguage(language: Lang) {
  currentLanguage = normalizeLang(language);
}
