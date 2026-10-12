/** Extension URLs for content-script shadow DOM (web_accessible_resources). */

function extUrl(path: string): string {
  // PublicPath typings regenerate after `wxt prepare` / build; cast keeps compile green.
  return (browser.runtime.getURL as (p: string) => string)(path);
}

export function overlayIconUrl(
  name:
    | "okkey-mark"
    | "okkey-logo"
    | "okkey-logo-lock"
    | "okkey-logo-lock-compact"
    | "lucide-x"
    | "lucide-unlock"
    | "lucide-lock"
    | "lucide-chevron-down"
    | "tabler-pencil"
    | "tabler-check"
    | "line-divider",
): string {
  return extUrl(`/icons/${name}.svg`);
}

/** Bundled Inter (woff2) via chrome-extension:// — required inside closed shadow roots. */
export function interFontFaceCss(): string {
  const regular = extUrl("/fonts/Inter-Regular.woff2");
  const medium = extUrl("/fonts/Inter-Medium.woff2");
  const semibold = extUrl("/fonts/Inter-SemiBold.woff2");
  return `
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("${regular}") format("woff2");
}
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("${medium}") format("woff2");
}
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("${semibold}") format("woff2");
}
`;
}

export const OVERLAY_FONT_STACK =
  '"Inter", system-ui, -apple-system, "Segoe UI", ui-sans-serif, sans-serif';
