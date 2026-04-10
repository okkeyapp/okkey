import { applySemanticAccentTint, readAccentTintEnabled } from "./accentSemanticTint.js";

export type ThemeMode = "light" | "dark";

export const DEFAULT_THEME: ThemeMode = "light";
export const DEFAULT_ACCENT_ID = "a2";

const ACCENT_IDS = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function normalizeAccentId(raw: string | null): string {
  if (!raw) return DEFAULT_ACCENT_ID;
  return ACCENT_IDS.has(raw) ? raw : DEFAULT_ACCENT_ID;
}

export function applyStoredTheme() {
  if (typeof document === "undefined") return;

  const themeRaw = readLocalStorage("okkey.theme");
  const theme: ThemeMode = themeRaw === "dark" ? "dark" : DEFAULT_THEME;

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
  root.classList.toggle("dark", theme === "dark");
  root.dataset.accent = accentId;

  applySemanticAccentTint(root, theme, accentId, readAccentTintEnabled());
}

