/**
 * Clipboard clear helpers for the Chromium offscreen document.
 *
 * Prefer `document.execCommand("copy" | "paste")` over `navigator.clipboard`:
 * the Async Clipboard API requires a focused document, and offscreen pages are
 * usually unfocused (MV3 typical pattern). Never clear when the current
 * clipboard text cannot be read — otherwise foreign user content is wiped.
 */

const CLEARED = " ";

export type OffscreenClearResult = {
  ok: boolean;
  cleared: boolean;
  reason?: string;
  token?: string;
  error?: string;
};

/**
 * Read via execCommand("paste") — works in unfocused Chromium offscreen
 * documents when the extension has the `clipboardRead` permission.
 */
export function tryReadClipboardTextViaExecCommandPaste(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const textarea = document.createElement("textarea");
  // Must be editable for paste (no readonly / disabled).
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.value = "";
  try {
    if (!document.execCommand("paste")) {
      return null;
    }
    return textarea.value;
  } catch {
    return null;
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Read clipboard when possible; `null` if unavailable.
 * Tries Async Clipboard first, then execCommand("paste") for unfocused offscreen.
 */
export async function tryReadClipboardText(): Promise<string | null> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      /* fall through — common when the offscreen document is unfocused */
    }
  }
  return tryReadClipboardTextViaExecCommandPaste();
}

/**
 * Write via execCommand — works in unfocused Chromium offscreen documents
 * where `navigator.clipboard.writeText` throws "Document is not focused".
 */
export function writeClipboardTextViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function writeClipboardTextForOffscreen(text: string): Promise<void> {
  if (writeClipboardTextViaExecCommand(text)) {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard write unavailable");
}

export async function clearOffscreenClipboardIfMatches(
  expectedText: string,
  token: string,
): Promise<OffscreenClearResult> {
  try {
    const current = await tryReadClipboardText();
    // Only clear when we can verify the clipboard still holds our copy.
    if (current === null) {
      return { ok: false, cleared: false, reason: "clipboard-unreadable" };
    }
    if (current !== expectedText) {
      return { ok: true, cleared: false, reason: "clipboard-changed" };
    }
    await writeClipboardTextForOffscreen(CLEARED);
    return { ok: true, cleared: true, token };
  } catch (error) {
    return {
      ok: false,
      cleared: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
