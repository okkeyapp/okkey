import { applySemanticAccentTint, readAccentTintEnabled } from "./accent-semantic-tint.js";

/** Resolved appearance: class `dark` on or off. */
export type ThemeMode = "light" | "dark";

/** User preference stored in `okkey.theme`. */
export type ThemePreference = "light" | "dark" | "auto";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "auto";
export const DEFAULT_ACCENT_ID = "a2";

const ACCENT_IDS = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
const THEME_PREFERENCES = new Set<string>(["light", "dark", "auto"]);

let systemThemeListenerBound = false;

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function normalizeThemePreference(raw: string | null): ThemePreference {
  if (raw === "light" || raw === "dark" || raw === "auto") {
    return raw;
  }
  return DEFAULT_THEME_PREFERENCE;
}

/** Current `okkey.theme` value (default `auto` if missing or invalid). */
export function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_PREFERENCE;
  }
  return normalizeThemePreference(readLocalStorage("okkey.theme"));
}

function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference === "dark") {
    return "dark";
  }
  if (preference === "light") {
    return "light";
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function normalizeAccentId(raw: string | null): string {
  if (!raw) return DEFAULT_ACCENT_ID;
  return ACCENT_IDS.has(raw) ? raw : DEFAULT_ACCENT_ID;
}

function bindSystemThemeListenerOnce(): void {
  if (systemThemeListenerBound || typeof window === "undefined") {
    return;
  }
  systemThemeListenerBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = (): void => {
    const pref = normalizeThemePreference(readLocalStorage("okkey.theme"));
    if (pref !== "auto") {
      return;
    }
    applyStoredTheme();
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onSchemeChange);
  } else {
    const legacy = mq as MediaQueryList & { addListener?: (cb: () => void) => void };
    legacy.addListener?.(onSchemeChange);
  }
}

export function applyStoredTheme() {
  if (typeof document === "undefined") return;

  const storedTheme = readLocalStorage("okkey.theme");
  const themePreference = normalizeThemePreference(storedTheme);

  if (storedTheme == null || !THEME_PREFERENCES.has(storedTheme)) {
    try {
      window.localStorage.setItem("okkey.theme", themePreference);
    } catch {
      /* ignore quota / private mode */
    }
  }

  const resolved = resolveThemeMode(themePreference);
  const storedAccent = readLocalStorage("okkey.accent");
  const accentId = normalizeAccentId(storedAccent);

  if (storedAccent == null || !ACCENT_IDS.has(storedAccent)) {
    try {
      window.localStorage.setItem("okkey.accent", accentId);
    } catch {
      /* ignore quota / private mode */
    }
  }

  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.accent = accentId;
  root.dataset.themePreference = themePreference;

  applySemanticAccentTint(root, resolved, accentId, readAccentTintEnabled());

  bindSystemThemeListenerOnce();
}
