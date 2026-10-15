/**
 * Background vault lifecycle for MV3: idle lock, device lock/sleep, popup-close
 * lock, and clipboard auto-clear that survives popup teardown.
 */
import {
  VAULT_UNLOCK_SESSION_STORAGE_KEY,
  type VaultUnlockSessionRecord,
  vaultIdleLockMsFromServerSeconds,
} from "@okkey/vault";

import { clearBackgroundClipboardIfMatches } from "./backgroundClipboardClear";
import {
  clearExtensionUnlockSession,
  DEFAULT_EXTENSION_IDLE_LOCK_MS,
  readExtensionDevicePrefs,
} from "./extensionVaultSession";
import { extensionSessionStorage } from "./extensionStorageApi";

export const POPUP_PORT_NAME = "okkey-popup";

export const VAULT_BG_MSG = {
  clipboardScheduleClear: "okkey.vault.clipboardScheduleClear",
  clipboardClearNow: "okkey.vault.clipboardClearNow",
  offscreenClearClipboard: "okkey.vault.offscreenClearClipboard",
} as const;

export const IDLE_LOCK_ALARM = "okkey.vault.idleLock";
export const CLIPBOARD_CLEAR_ALARM = "okkey.clipboardClear";

const CLIPBOARD_PENDING_KEY = "okkey.clipboard.pendingClear.v1";
const OFFSCREEN_URL = "offscreen.html";
const OFFSCREEN_REASON = "CLIPBOARD" as const;

export type ClipboardPendingClear = {
  /** Exact text copied from Okkey vault fields — clear only if clipboard still matches. */
  text: string;
  /** Opaque token identifying this Okkey copy (not written to the system clipboard). */
  token: string;
  clearAt: number;
};

type ClipboardScheduleMessage = {
  type: typeof VAULT_BG_MSG.clipboardScheduleClear;
  text: string;
  clearSeconds: number;
  token: string;
};

type OffscreenClearMessage = {
  type: typeof VAULT_BG_MSG.offscreenClearClipboard;
  text: string;
  token: string;
};

function chromeSessionKv() {
  return {
    async getItem(key: string): Promise<string | null> {
      const area = extensionSessionStorage();
      if (!area) return null;
      const bag = await area.get(key);
      const value = bag[key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      const area = extensionSessionStorage();
      if (!area) return;
      await area.set({ [key]: value });
    },
    async removeItem(key: string): Promise<void> {
      const area = extensionSessionStorage();
      if (!area) return;
      await area.remove(key);
    },
  };
}

function parseUnlockSession(raw: string | null): VaultUnlockSessionRecord | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<VaultUnlockSessionRecord>;
    if (o.v !== 1 || !o.user_id?.trim()) return null;
    if (typeof o.last_activity_at !== "number" || !Number.isFinite(o.last_activity_at)) {
      return null;
    }
    const idleLockMs =
      typeof o.idle_lock_ms === "number" && Number.isFinite(o.idle_lock_ms) && o.idle_lock_ms > 0
        ? o.idle_lock_ms
        : DEFAULT_EXTENSION_IDLE_LOCK_MS;
    return {
      v: 1,
      user_id: o.user_id,
      vault_key_b64: typeof o.vault_key_b64 === "string" ? o.vault_key_b64 : "",
      ...(o.password_share_c_b64 ? { password_share_c_b64: o.password_share_c_b64 } : {}),
      last_activity_at: o.last_activity_at,
      idle_lock_ms: idleLockMs,
    };
  } catch {
    return null;
  }
}

async function readUnlockSession(): Promise<VaultUnlockSessionRecord | null> {
  return parseUnlockSession(await chromeSessionKv().getItem(VAULT_UNLOCK_SESSION_STORAGE_KEY));
}

export async function lockVaultFromBackground(): Promise<void> {
  await clearExtensionUnlockSession();
  try {
    await browser.alarms.clear(IDLE_LOCK_ALARM);
  } catch {
    /* ignore */
  }
}

async function scheduleIdleLockAlarm(delayMs: number): Promise<void> {
  try {
    await browser.alarms.clear(IDLE_LOCK_ALARM);
  } catch {
    /* ignore */
  }
  if (delayMs <= 0) return;
  await browser.alarms.create(IDLE_LOCK_ALARM, { when: Date.now() + delayMs });
}

async function cancelIdleLockAlarm(): Promise<void> {
  try {
    await browser.alarms.clear(IDLE_LOCK_ALARM);
  } catch {
    /* ignore */
  }
}

/**
 * Popup opened: cancel idle countdown and refresh activity so the next close
 * starts a full idle window.
 */
export async function onPopupOpened(): Promise<void> {
  await cancelIdleLockAlarm();
  const session = await readUnlockSession();
  if (!session) return;
  session.last_activity_at = Date.now();
  await chromeSessionKv().setItem(VAULT_UNLOCK_SESSION_STORAGE_KEY, JSON.stringify(session));
}

/**
 * Popup closed: optionally lock immediately, otherwise start idle countdown
 * from this moment (full idleLockMs).
 */
export async function onPopupClosed(): Promise<void> {
  const session = await readUnlockSession();
  if (!session) {
    await cancelIdleLockAlarm();
    return;
  }
  const prefs = await readExtensionDevicePrefs(session.user_id);
  if (prefs.lockOnPopupClose) {
    await lockVaultFromBackground();
    return;
  }
  const idleMs =
    typeof prefs.idleLockSeconds === "number"
      ? vaultIdleLockMsFromServerSeconds(prefs.idleLockSeconds)
      : session.idle_lock_ms > 0
        ? session.idle_lock_ms
        : DEFAULT_EXTENSION_IDLE_LOCK_MS;
  session.last_activity_at = Date.now();
  session.idle_lock_ms = idleMs;
  await chromeSessionKv().setItem(VAULT_UNLOCK_SESSION_STORAGE_KEY, JSON.stringify(session));
  await scheduleIdleLockAlarm(idleMs);
}

export async function onDeviceIdleStateChanged(state: string): Promise<void> {
  if (state !== "locked") {
    return;
  }
  const session = await readUnlockSession();
  if (!session) return;
  const prefs = await readExtensionDevicePrefs(session.user_id);
  if (!prefs.lockOnDeviceSleep) return;
  await lockVaultFromBackground();
}

export async function onIdleLockAlarm(): Promise<void> {
  const session = await readUnlockSession();
  if (!session) return;
  if (Date.now() - session.last_activity_at < session.idle_lock_ms) {
    const remaining = session.idle_lock_ms - (Date.now() - session.last_activity_at);
    await scheduleIdleLockAlarm(remaining);
    return;
  }
  await lockVaultFromBackground();
}

async function writeClipboardPending(pending: ClipboardPendingClear | null): Promise<void> {
  const area = extensionSessionStorage();
  if (!area) return;
  if (!pending) {
    await area.remove(CLIPBOARD_PENDING_KEY);
    return;
  }
  await area.set({ [CLIPBOARD_PENDING_KEY]: JSON.stringify(pending) });
}

async function readClipboardPending(): Promise<ClipboardPendingClear | null> {
  const area = extensionSessionStorage();
  if (!area) return null;
  const bag = await area.get(CLIPBOARD_PENDING_KEY);
  const raw = bag[CLIPBOARD_PENDING_KEY];
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<ClipboardPendingClear>;
    if (!o.text || !o.token || typeof o.clearAt !== "number") return null;
    return { text: o.text, token: o.token, clearAt: o.clearAt };
  } catch {
    return null;
  }
}

export async function scheduleClipboardClearFromBackground(input: {
  text: string;
  clearSeconds: number;
  token: string;
}): Promise<void> {
  try {
    await browser.alarms.clear(CLIPBOARD_CLEAR_ALARM);
  } catch {
    /* ignore */
  }
  if (input.clearSeconds <= 0 || !input.text || !input.token) {
    await writeClipboardPending(null);
    return;
  }
  const clearAt = Date.now() + input.clearSeconds * 1000;
  await writeClipboardPending({
    text: input.text,
    token: input.token,
    clearAt,
  });
  await browser.alarms.create(CLIPBOARD_CLEAR_ALARM, { when: clearAt });
}

async function hasOffscreenDocument(): Promise<boolean> {
  const chromeApi = (globalThis as { chrome?: typeof chrome }).chrome;
  if (!chromeApi?.runtime?.getContexts) {
    return false;
  }
  try {
    const contexts = await chromeApi.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
      documentUrls: [browser.runtime.getURL(OFFSCREEN_URL)],
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

async function ensureOffscreenDocument(): Promise<boolean> {
  const chromeApi = (globalThis as { chrome?: typeof chrome }).chrome;
  if (!chromeApi?.offscreen?.createDocument) {
    return false;
  }
  if (await hasOffscreenDocument()) {
    return true;
  }
  try {
    await chromeApi.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [OFFSCREEN_REASON],
      justification: "Clear Okkey vault clipboard after the configured timeout",
    });
    return true;
  } catch {
    return false;
  }
}

type OffscreenClearAttempt = "done" | "unavailable";

async function clearClipboardViaOffscreen(
  pending: ClipboardPendingClear,
): Promise<OffscreenClearAttempt> {
  const ready = await ensureOffscreenDocument();
  if (!ready) return "unavailable";
  // Allow the offscreen module to register its message listener after createDocument.
  await new Promise((resolve) => setTimeout(resolve, 75));
  try {
    const msg: OffscreenClearMessage = {
      type: VAULT_BG_MSG.offscreenClearClipboard,
      text: pending.text,
      token: pending.token,
    };
    const response = (await browser.runtime.sendMessage(msg)) as
      | { ok?: boolean; cleared?: boolean; reason?: string }
      | undefined;
    if (!response) return "unavailable";
    if (response.cleared) return "done";
    // Verified the clipboard no longer holds our copy — finish the pending clear.
    if (response.ok && response.reason === "clipboard-changed") return "done";
    // Unreadable / write failed: try Firefox background path or popup flush.
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

async function finishClipboardPending(): Promise<void> {
  await writeClipboardPending(null);
  try {
    await browser.alarms.clear(CLIPBOARD_CLEAR_ALARM);
  } catch {
    /* ignore */
  }
}

/**
 * Clear clipboard only when it still holds the Okkey-copied text for this token.
 * Chromium: offscreen document (execCommand paste/copy).
 * Firefox: navigator.clipboard in the background (no offscreen API).
 * Otherwise keeps the pending marker so the next popup open can finish the clear.
 */
export async function runClipboardClearAlarm(): Promise<void> {
  const pending = await readClipboardPending();
  if (!pending) return;
  if (Date.now() < pending.clearAt - 250) {
    await browser.alarms.create(CLIPBOARD_CLEAR_ALARM, { when: pending.clearAt });
    return;
  }
  const offscreen = await clearClipboardViaOffscreen(pending);
  if (offscreen === "done") {
    await finishClipboardPending();
    return;
  }
  // Firefox (and any runtime with background clipboard access): clear here.
  const background = await clearBackgroundClipboardIfMatches(pending.text);
  if (background.handled) {
    await finishClipboardPending();
    return;
  }
  // Leave pending for popup flush when neither path can verify ownership.
}

/** Popup: finish a due clear with page clipboard APIs (read-before-clear). */
export async function flushPendingClipboardClearInPage(): Promise<void> {
  const pending = await readClipboardPending();
  if (!pending) return;
  if (Date.now() < pending.clearAt) return;
  try {
    if (!navigator.clipboard?.readText || !navigator.clipboard?.writeText) {
      return;
    }
    const current = await navigator.clipboard.readText();
    if (current !== pending.text) {
      await finishClipboardPending();
      return;
    }
    await navigator.clipboard.writeText(" ");
  } catch {
    /* unread / write failed — keep pending rather than wiping blindly */
    return;
  }
  await finishClipboardPending();
}

export function isClipboardScheduleMessage(message: unknown): message is ClipboardScheduleMessage {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  const m = message as Partial<ClipboardScheduleMessage>;
  return (
    m.type === VAULT_BG_MSG.clipboardScheduleClear &&
    typeof m.text === "string" &&
    typeof m.clearSeconds === "number" &&
    typeof m.token === "string"
  );
}

export function isOffscreenClearMessage(message: unknown): message is OffscreenClearMessage {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  const m = message as Partial<OffscreenClearMessage>;
  return (
    m.type === VAULT_BG_MSG.offscreenClearClipboard &&
    typeof m.text === "string" &&
    typeof m.token === "string"
  );
}

export function wireExtensionVaultLifecycle(): void {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== POPUP_PORT_NAME) return;
    void onPopupOpened();
    port.onDisconnect.addListener(() => {
      void onPopupClosed();
    });
  });

  const idleApi = browser.idle;
  if (idleApi?.onStateChanged) {
    try {
      idleApi.setDetectionInterval?.(60);
    } catch {
      /* optional */
    }
    idleApi.onStateChanged.addListener((state) => {
      void onDeviceIdleStateChanged(state);
    });
  }

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === IDLE_LOCK_ALARM) {
      void onIdleLockAlarm();
      return;
    }
    if (alarm.name === CLIPBOARD_CLEAR_ALARM) {
      void runClipboardClearAlarm();
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (isClipboardScheduleMessage(message)) {
      return scheduleClipboardClearFromBackground({
        text: message.text,
        clearSeconds: message.clearSeconds,
        token: message.token,
      }).then(() => ({ ok: true }));
    }
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === VAULT_BG_MSG.clipboardClearNow
    ) {
      return flushPendingClipboardClearInPage().then(() => ({ ok: true }));
    }
    return undefined;
  });
}
