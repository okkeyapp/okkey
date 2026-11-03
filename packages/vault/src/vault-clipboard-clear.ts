/**
 * Schedule clearing the system clipboard after copying sensitive values.
 *
 * Browsers require user activation for clipboard writes. A bare `writeText("")`
 * inside `setTimeout` is usually rejected (NotAllowedError). We arm a
 * promise-based `ClipboardItem` write during the copy gesture so the browser
 * accepts the clear when the timer fires. Fallbacks cover older engines.
 */

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let clearGeneration = 0;

/** Non-empty clear payload — some browsers reject writing an empty string. */
const CLEARED_CLIPBOARD_TEXT = " ";

function supportsDeferredClipboardItem(): boolean {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  );
}

async function writeClipboardText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through to execCommand */
    }
  }
  if (typeof document === "undefined") {
    return;
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

async function clearClipboardIfUnchanged(
  copiedText: string | undefined,
  generation: number,
): Promise<void> {
  if (generation !== clearGeneration) {
    return;
  }
  if (copiedText && navigator.clipboard?.readText) {
    try {
      const current = await navigator.clipboard.readText();
      if (generation !== clearGeneration) {
        return;
      }
      if (current !== copiedText) {
        return;
      }
    } catch {
      /* No read permission — still attempt clear. */
    }
  }
  await writeClipboardText(CLEARED_CLIPBOARD_TEXT);
}

function armFallbackTimer(delayMs: number, copiedText: string | undefined, generation: number): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
  }
  clearTimer = setTimeout(() => {
    clearTimer = null;
    void clearClipboardIfUnchanged(copiedText, generation);
  }, delayMs);
}

/**
 * Must be called in the same turn as a user-gesture clipboard write (or
 * immediately after it) so deferred `ClipboardItem` can capture activation.
 */
export function scheduleClipboardClearAfterCopy(opts: {
  clipboardClearSeconds: number;
  copiedText?: string;
}): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  const generation = ++clearGeneration;
  const seconds = opts.clipboardClearSeconds;
  if (seconds <= 0) {
    return;
  }
  const delayMs = seconds * 1000;
  const copiedText = opts.copiedText;

  if (supportsDeferredClipboardItem()) {
    try {
      const writePromise = navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Promise<Blob>((resolve, reject) => {
            clearTimer = setTimeout(() => {
              clearTimer = null;
              void (async () => {
                if (generation !== clearGeneration) {
                  reject(new DOMException("Clipboard clear superseded", "AbortError"));
                  return;
                }
                if (copiedText && navigator.clipboard.readText) {
                  try {
                    const current = await navigator.clipboard.readText();
                    if (generation !== clearGeneration) {
                      reject(new DOMException("Clipboard clear superseded", "AbortError"));
                      return;
                    }
                    if (current !== copiedText) {
                      reject(new DOMException("Clipboard changed", "AbortError"));
                      return;
                    }
                  } catch {
                    /* clear anyway */
                  }
                }
                resolve(new Blob([CLEARED_CLIPBOARD_TEXT], { type: "text/plain" }));
              })();
            }, delayMs);
          }),
        }),
      ]);
      void writePromise.catch((error: unknown) => {
        if (generation !== clearGeneration) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Initial write() rejected (no activation / unsupported) — try later.
        armFallbackTimer(delayMs, copiedText, generation);
      });
      return;
    } catch {
      /* fall through */
    }
  }

  armFallbackTimer(delayMs, copiedText, generation);
}

export async function copyTextWithVaultClipboardPolicy(opts: {
  clipboardClearSeconds: number;
  text: string;
}): Promise<void> {
  await writeClipboardText(opts.text);
  scheduleClipboardClearAfterCopy({
    clipboardClearSeconds: opts.clipboardClearSeconds,
    copiedText: opts.text,
  });
}

/** @internal test helper */
export function _resetVaultClipboardClearForTests(): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  clearGeneration = 0;
}
