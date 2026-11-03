/**
 * Firefox (and other non-offscreen) background clipboard clear.
 *
 * Chromium service workers have no clipboard access — use the offscreen
 * document instead. Firefox MV3 backgrounds can use `navigator.clipboard`
 * when the extension has `clipboardRead` / `clipboardWrite`.
 *
 * Never clear when the current text cannot be read or no longer matches the
 * Okkey-copied value (do not wipe foreign clipboard content).
 */

const CLEARED = " ";

export type BackgroundClearResult = {
  /** True when this path finished the pending clear (cleared or intentionally skipped). */
  handled: boolean;
  cleared: boolean;
  reason?: string;
  error?: string;
};

export function canUseBackgroundClipboardApi(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.readText === "function" &&
    typeof navigator.clipboard?.writeText === "function"
  );
}

/**
 * Clear the system clipboard from the background script only when it still
 * holds `expectedText`. Returns `handled: false` when the API is missing or
 * throws (caller may fall back to popup flush).
 */
export async function clearBackgroundClipboardIfMatches(
  expectedText: string,
): Promise<BackgroundClearResult> {
  if (!canUseBackgroundClipboardApi()) {
    return { handled: false, cleared: false, reason: "clipboard-api-unavailable" };
  }
  try {
    const current = await navigator.clipboard.readText();
    if (current !== expectedText) {
      return { handled: true, cleared: false, reason: "clipboard-changed" };
    }
    await navigator.clipboard.writeText(CLEARED);
    return { handled: true, cleared: true };
  } catch (error) {
    return {
      handled: false,
      cleared: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
