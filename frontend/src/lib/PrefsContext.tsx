import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { getChurchSettings } from "./api";
import { BUNDLED_VERSION, readAppVersion } from "./appVersion";
import {
  clockLocale,
  htmlLang,
  normalizeLang,
  translate,
  type Lang,
} from "./i18n";

const THEME_KEY = "mc.theme";
const LANG_KEY = "mc.lang";

export type ThemeName = "dark" | "light";

type PrefsValue = {
  theme: ThemeName;
  language: Lang;
  version: string;
  setTheme: (theme: ThemeName) => void;
  setLanguage: (language: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  clockLocale: string;
};

const PrefsContext = createContext<PrefsValue | null>(null);

function readStoredTheme(): ThemeName {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function readStoredLang(): Lang {
  try {
    return normalizeLang(localStorage.getItem(LANG_KEY));
  } catch {
    return "en";
  }
}

function applyDocument(theme: ThemeName, language: Lang, forceDark: boolean) {
  const root = document.documentElement;
  const effective = forceDark ? "dark" : theme;
  root.classList.toggle("theme-light", effective === "light");
  root.classList.toggle("theme-dark", effective === "dark");
  root.lang = htmlLang(language);
  root.style.colorScheme = effective;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);
  const [language, setLanguageState] = useState<Lang>(readStoredLang);
  const [version, setVersion] = useState(BUNDLED_VERSION);
  const forceDark = pathname === "/output";

  useEffect(() => {
    applyDocument(theme, language, forceDark);
  }, [theme, language, forceDark]);

  useEffect(() => {
    void readAppVersion().then(setVersion);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getChurchSettings();
        if (cancelled || !settings) return;
        if (settings.theme === "light" || settings.theme === "dark") {
          setThemeState(settings.theme);
          try {
            localStorage.setItem(THEME_KEY, settings.theme);
          } catch {
            /* ignore */
          }
        }
        if (settings.interface_language) {
          const next = normalizeLang(settings.interface_language);
          setLanguageState(next);
          try {
            localStorage.setItem(LANG_KEY, next);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* offline / unsigned-in */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setLanguage = useCallback((next: Lang) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(language, key, vars),
    [language],
  );

  const value = useMemo(
    () => ({
      theme,
      language,
      version,
      setTheme,
      setLanguage,
      t,
      clockLocale: clockLocale(language),
    }),
    [theme, language, version, setTheme, setLanguage, t],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs must be used within PrefsProvider");
  return value;
}
