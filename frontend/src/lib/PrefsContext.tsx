import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getChurchSettings } from "./api";
import { BUNDLED_VERSION, readAppVersion } from "./appVersion";
import {
  SESSION_PROFILE_EVENT,
  readCachedSessionProfile,
  type SessionProfile,
} from "./auth";
import {
  clockLocale,
  htmlLang,
  normalizeLang,
  translate,
  type Lang,
} from "./i18n";
import { setCurrentLanguage } from "./langStore";

const THEME_KEY = "mc.theme";
const LANG_KEY = "mc.lang";

export type ThemeName = "dark" | "light" | "system";

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

function langStorageKey(userId?: string | null) {
  return userId ? `${LANG_KEY}.${userId}` : LANG_KEY;
}

function readStoredTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "system" || raw === "dark") return raw;
    return "dark";
  } catch {
    return "dark";
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
}

function resolveTheme(theme: ThemeName): "dark" | "light" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function readStoredLang(userId?: string | null): Lang {
  try {
    if (userId) {
      const scoped = localStorage.getItem(langStorageKey(userId));
      if (scoped) return normalizeLang(scoped);
      // Migrate legacy shared key into this user's preference once.
      const legacy = localStorage.getItem(LANG_KEY);
      if (legacy) {
        localStorage.setItem(langStorageKey(userId), legacy);
        return normalizeLang(legacy);
      }
      return "en";
    }
    return normalizeLang(localStorage.getItem(LANG_KEY));
  } catch {
    return "en";
  }
}

function writeStoredLang(userId: string | null, language: Lang) {
  try {
    localStorage.setItem(langStorageKey(userId), language);
  } catch {
    /* ignore */
  }
}

function profileUserId(profile: SessionProfile | null | undefined) {
  return profile?.user?.id ?? null;
}

let languageMirror: Lang = readStoredLang(
  profileUserId(readCachedSessionProfile()),
);
setCurrentLanguage(languageMirror);

function syncLanguageMirror(next: Lang) {
  languageMirror = next;
  setCurrentLanguage(next);
}

function readPathname() {
  try {
    const hash = window.location.hash || "";
    if (hash.startsWith("#/")) {
      return hash.slice(1).split("?")[0] || "/";
    }
    return window.location.pathname || "/";
  } catch {
    return "/";
  }
}

function applyDocument(theme: ThemeName, language: Lang, forceDark: boolean) {
  const root = document.documentElement;
  const effective = forceDark ? "dark" : resolveTheme(theme);
  root.classList.toggle("theme-light", effective === "light");
  root.classList.toggle("theme-dark", effective === "dark");
  root.lang = htmlLang(language);
  root.style.colorScheme = effective;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  // Allow nesting: if a parent already provides prefs, reuse it.
  const existing = useContext(PrefsContext);
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);
  const [langUserId, setLangUserId] = useState<string | null>(() =>
    profileUserId(readCachedSessionProfile()),
  );
  const [language, setLanguageState] = useState<Lang>(() =>
    readStoredLang(profileUserId(readCachedSessionProfile())),
  );
  const [version, setVersion] = useState(BUNDLED_VERSION);
  const [pathname, setPathname] = useState(readPathname);
  const forceDark = pathname === "/output" || pathname.endsWith("/output");

  useEffect(() => {
    syncLanguageMirror(language);
  }, [language]);

  useEffect(() => {
    if (existing) return;
    const syncPath = () => setPathname(readPathname());
    window.addEventListener("popstate", syncPath);
    window.addEventListener("hashchange", syncPath);
    // React Router navigations don't always fire popstate on all setups.
    const previous = window.history.pushState.bind(window.history);
    const previousReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args) => {
      previous(...args);
      syncPath();
    };
    window.history.replaceState = (...args) => {
      previousReplace(...args);
      syncPath();
    };
    syncPath();
    return () => {
      window.removeEventListener("popstate", syncPath);
      window.removeEventListener("hashchange", syncPath);
      window.history.pushState = previous;
      window.history.replaceState = previousReplace;
    };
  }, [existing]);

  useEffect(() => {
    if (existing) return;
    applyDocument(theme, language, forceDark);
  }, [existing, theme, language, forceDark]);

  useEffect(() => {
    if (existing || theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyDocument("system", language, forceDark);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [existing, theme, language, forceDark]);

  useEffect(() => {
    if (existing) return;
    void readAppVersion().then(setVersion);
  }, [existing]);

  // Language is per signed-in user (localStorage), never church-wide.
  useEffect(() => {
    if (existing) return;
    const applyForUser = (userId: string | null) => {
      setLangUserId(userId);
      const next = readStoredLang(userId);
      syncLanguageMirror(next);
      setLanguageState(next);
    };

    applyForUser(profileUserId(readCachedSessionProfile()));

    const onProfile = (event: Event) => {
      const detail = (event as CustomEvent<SessionProfile | null>).detail;
      applyForUser(profileUserId(detail));
    };
    window.addEventListener(SESSION_PROFILE_EVENT, onProfile);
    return () => window.removeEventListener(SESSION_PROFILE_EVENT, onProfile);
  }, [existing]);

  // Theme can still follow church settings; language must not.
  useEffect(() => {
    if (existing) return;
    let cancelled = false;
    void (async () => {
      try {
        const settings = await getChurchSettings();
        if (cancelled || !settings) return;
        if (
          settings.theme === "light" ||
          settings.theme === "dark" ||
          settings.theme === "system"
        ) {
          setThemeState(settings.theme);
          try {
            localStorage.setItem(THEME_KEY, settings.theme);
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
  }, [existing]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setLanguage = useCallback(
    (next: Lang) => {
      setLanguageState(next);
      syncLanguageMirror(next);
      writeStoredLang(langUserId, next);
    },
    [langUserId],
  );

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

  if (existing) return <>{children}</>;

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs must be used within PrefsProvider");
  return value;
}
