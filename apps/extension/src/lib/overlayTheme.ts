import {
  accentPrimaryHslTriplet,
  DEFAULT_ACCENT_ID,
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
} from "@okkey/ui";

import { readExtensionThemePreference } from "./extensionVaultSession";

const ACCENT_IDS = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);

const LIGHT = {
  bg: "0 0% 100%",
  fg: "0 0% 3.9%",
  muted: "0 0% 45.1%",
  mutedBg: "210 40% 96.1%",
  hover: "210 40% 96.1%",
  rowMuted: "210 40% 96.1%",
  editBtn: "210 16% 91%",
  shadow: "15, 23, 42",
} as const;

const DARK = {
  bg: "222.2 84% 4.9%",
  fg: "210 40% 98%",
  muted: "215 20.2% 65.1%",
  mutedBg: "217.2 32.6% 17.5%",
  hover: "217.2 32.6% 20%",
  rowMuted: "217.2 32.6% 17.5%",
  editBtn: "217.2 32.6% 22%",
  shadow: "0, 0, 0",
} as const;

export type OverlayThemeCss = {
  cssVars: string;
  dark: boolean;
};

export async function resolveOverlayThemeCss(): Promise<OverlayThemeCss> {
  const stored = await readExtensionThemePreference();
  const preference = normalizeThemePreference(stored.theme ?? DEFAULT_THEME_PREFERENCE);
  let dark: boolean;
  if (preference === "dark") {
    dark = true;
  } else if (preference === "light") {
    dark = false;
  } else {
    dark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  const accentId =
    stored.accent && ACCENT_IDS.has(stored.accent) ? stored.accent : DEFAULT_ACCENT_ID;
  const primary = accentPrimaryHslTriplet(dark ? "dark" : "light", accentId);
  const tokens = dark ? DARK : LIGHT;
  const cssVars = `
    --ok-bg: ${tokens.bg};
    --ok-fg: ${tokens.fg};
    --ok-muted: ${tokens.muted};
    --ok-muted-bg: ${tokens.mutedBg};
    --ok-hover: ${tokens.hover};
    --ok-row-muted: ${tokens.rowMuted};
    --ok-edit-btn: ${tokens.editBtn};
    --ok-primary: ${primary};
    --ok-primary-fg: 0 0% 100%;
    --ok-shadow: ${tokens.shadow};
  `;
  return { cssVars, dark };
}
