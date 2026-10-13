/**
 * Chromium offscreen document: clear system clipboard when it still holds an
 * Okkey vault field copy (matched by exact text + background token).
 */
import { isOffscreenClearMessage } from "../lib/extensionVaultLifecycle";

const CLEARED = " ";

browser.runtime.onMessage.addListener((message) => {
  if (!isOffscreenClearMessage(message)) {
    return undefined;
  }
  return (async () => {
    try {
      if (navigator.clipboard?.readText) {
        const current = await navigator.clipboard.readText();
        if (current !== message.text) {
          return { ok: true, cleared: false, reason: "clipboard-changed" };
        }
      }
      await navigator.clipboard.writeText(CLEARED);
      return { ok: true, cleared: true, token: message.token };
    } catch (error) {
      return {
        ok: false,
        cleared: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();
});
