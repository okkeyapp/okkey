import {
  applySemanticAccentTint,
  DEFAULT_ACCENT_ID,
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
  type ThemePreference,
} from "@okkey/ui";

import { readExtensionThemePreference } from "./extensionVaultSession";

/**
 * Apply theme/accent from extension chrome.storage.local onto the popup document.
 * Falls back to the same defaults as web (`auto` / `a2`).
 */
export async function applyExtensionStoredTheme(): Promise<ThemePreference> {
  if (typeof document === "undefined") {
    return DEFAULT_THEME_PREFERENCE;
  }

  const stored = await readExtensionThemePreference();
  const themePreference = normalizeThemePreference(stored.theme);

  let resolved: "light" | "dark";
  if (themePreference === "dark") {
    resolved = "dark";
  } else if (themePreference === "light") {
    resolved = "light";
  } else if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    resolved = "light";
  }

  const accentIds = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
  const accentId =
    stored.accent && accentIds.has(stored.accent) ? stored.accent : DEFAULT_ACCENT_ID;
  const tintEnabled = stored.accentTint === "1" || stored.accentTint === "true";

  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.accent = accentId;
  root.dataset.themePreference = themePreference;
  applySemanticAccentTint(root, resolved, accentId, tintEnabled);

  // Mirror into popup localStorage so shared helpers that still read it stay consistent.
  try {
    window.localStorage.setItem("okkey.theme", themePreference);
    window.localStorage.setItem("okkey.accent", accentId);
  } catch {
    /* ignore */
  }

  return themePreference;
}
