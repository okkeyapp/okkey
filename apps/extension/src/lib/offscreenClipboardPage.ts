/**
 * Chromium offscreen document entry: clear system clipboard when it still holds
 * an Okkey vault field copy (matched by exact text + background token).
 */
import { clearOffscreenClipboardIfMatches } from "./offscreenClipboardClear";
import { isOffscreenClearMessage } from "./extensionVaultLifecycle";

browser.runtime.onMessage.addListener((message) => {
  if (!isOffscreenClearMessage(message)) {
    return undefined;
  }
  return clearOffscreenClipboardIfMatches(message.text, message.token);
});
