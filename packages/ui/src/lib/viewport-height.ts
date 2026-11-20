/**
 * Mobile Safari treats classic `100vh` / `h-screen` as the *large* viewport
 * (toolbars hidden). That makes full-height shells taller than the visible area
 * and introduces an extra vertical page scroll. Prefer dynamic / small units
 * with a `vh` fallback for older browsers.
 *
 * Class order documents intent (fallback first). Tailwind emits `*-screen`
 * before `*-dvh` / `*-svh` in the stylesheet, so the modern unit wins when
 * supported. Do not dual-stack arbitrary `max-h-[calc(100vh…)]` /
 * `max-h-[calc(100dvh…)]` pairs — arbitrary-value sort can let `vh` win.
 */

/** Scrollable full-page shells (auth, loaders, marketing stubs). */
export const minHAppClassName = "min-h-screen min-h-dvh";

/**
 * Fixed overflow-hidden app chrome (vault / workspace shell).
 * `svh` never exceeds the visible area while browser chrome is showing.
 */
export const hAppShellClassName = "h-screen h-svh";

/**
 * Safe-area insets when content meets the physical screen edges.
 * Requires `viewport-fit=cover` on the document viewport meta.
 */
export const safeAreaPaddingClassName =
  "pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]";

/**
 * Scrollport inside a flex `min-h-dvh` shell: fills remaining height and scrolls
 * when the auth card is taller than the viewport (keyboard / small phones).
 */
export const authShellScrollClassName =
  "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto";

/**
 * Full-height column inside the scrollport. Horizontal centering only —
 * vertical centering is via `authShellCenteredCardClassName` (`my-auto`) so
 * overflowing content stays top-aligned and scrollable (unlike `justify-center`).
 */
export const authShellScrollInnerClassName =
  "flex min-h-full min-w-0 flex-col items-center";

/**
 * Auth card stack: vertically centered when shorter than the scrollport;
 * collapses to the top when taller so the start of the form stays reachable.
 */
export const authShellCenteredCardClassName =
  "my-auto flex w-full flex-col items-center";
