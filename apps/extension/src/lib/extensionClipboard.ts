/**
 * Extension clipboard copy: write in the popup (user gesture), schedule clear
 * in the background service worker so the timer survives popup close.
 * Only Okkey vault-field copies get a pending token; ordinary OS copies are
 * never cleared.
 */
import { VAULT_BG_MSG } from "./extensionVaultLifecycle";

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through */
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function newCopyToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `okkey-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function copyTextWithExtensionClipboardPolicy(opts: {
  clipboardClearSeconds: number;
  text: string;
}): Promise<void> {
  await writeClipboardText(opts.text);
  if (opts.clipboardClearSeconds <= 0) {
    return;
  }
  const token = newCopyToken();
  try {
    await browser.runtime.sendMessage({
      type: VAULT_BG_MSG.clipboardScheduleClear,
      text: opts.text,
      clearSeconds: opts.clipboardClearSeconds,
      token,
    });
  } catch {
    /* SW unavailable — leave text in clipboard without auto-clear */
  }
}
