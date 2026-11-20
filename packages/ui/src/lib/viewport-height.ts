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
 * Auth / centered shells: lock to the dynamic viewport so a flex-1 scrollport
 * gets a definite height (needed for `my-auto` centering). Keep `min-h-*` as a
 * fallback when `h-dvh` is unsupported.
 */
export const authShellRootClassName = "flex h-screen min-h-screen h-dvh min-h-dvh flex-col";

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
 * Flex-1 scrollport inside a column `min-h-dvh` shell. The auth card must be a
 * direct flex child (see `authShellCenteredCardClassName`) — nested `min-h-full`
 * wrappers often fail to resolve against a flex item and leave content top-stuck.
 */
export const authShellScrollClassName =
  "relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-y-auto";

/**
 * Auth card stack: `my-auto` centers when shorter than the scrollport and
 * collapses to the start when taller so the form top stays reachable.
 */
export const authShellCenteredCardClassName =
  "my-auto flex w-full flex-col items-center";
