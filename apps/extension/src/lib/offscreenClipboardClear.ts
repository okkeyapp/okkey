/**
 * Clipboard clear helpers for the Chromium offscreen document.
 *
 * Prefer `document.execCommand("copy")` over `navigator.clipboard`: the Async
 * Clipboard API requires a focused document, and offscreen pages are usually
 * unfocused (MV3 typical pattern).
 */

const CLEARED = " ";

export type OffscreenClearResult = {
  ok: boolean;
  cleared: boolean;
  reason?: string;
  token?: string;
  error?: string;
};

/** Read clipboard when possible; `null` if unavailable (e.g. document unfocused). */
export async function tryReadClipboardText(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null;
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
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
    // When read fails (unfocused offscreen), still attempt clear — same policy
    // as web vault clipboard clear when read permission is missing.
    if (current !== null && current !== expectedText) {
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
