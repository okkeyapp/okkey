/**
 * OKKEY stacking scale (must stay in sync with `apps/web` Tailwind `theme.extend.zIndex`
 * and CSS vars in `apps/web/src/index.css`).
 *
 * Low → high:
 * sticky → sidebar → popup → popupNested → popupNestedHigh → floating → tooltip → lightbox
 */
export const OKKEY_Z_INDEX = {
  sticky: 40,
  sidebarOverlay: 50,
  sidebar: 60,
  popup: 70,
  popupNested: 80,
  popupNestedHigh: 90,
  floating: 100,
  tooltip: 110,
  lightbox: 120,
} as const;

export type OkkeyZIndexLayer = keyof typeof OKKEY_Z_INDEX;

/** Tailwind class names for the scale (`z-popup`, `z-floating`, …). */
export const OKKEY_Z_INDEX_CLASS = {
  sticky: "z-sticky",
  sidebarOverlay: "z-sidebar-overlay",
  sidebar: "z-sidebar",
  popup: "z-popup",
  popupNested: "z-popup-nested",
  popupNestedHigh: "z-popup-nested-high",
  floating: "z-floating",
  tooltip: "z-tooltip",
  lightbox: "z-lightbox",
} as const;
