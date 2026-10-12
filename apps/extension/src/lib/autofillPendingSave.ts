import type {
  AutofillPendingSaveGetResponse,
  AutofillPendingSavePayload,
} from "./autofillMessages.ts";
import { normalizeSaveUrl } from "./autofillSaveUrls.ts";

const PENDING_SAVE_TTL_MS = 90_000;
const PENDING_SAVE_SESSION_KEY = "okkey.autofill.pendingSaveByTab";

type PendingSaveByTab = Record<string, AutofillPendingSavePayload>;

const pendingSaveByTab = new Map<number, AutofillPendingSavePayload>();
let pendingSaveSessionHydrated = false;
/** In-flight hydrate — concurrent get/set must await the same promise (SW cold start). */
let pendingSaveHydratePromise: Promise<void> | null = null;

/** @internal test helper — reset module state between cases. */
export function resetPendingSaveStateForTests(): void {
  pendingSaveByTab.clear();
  pendingSaveSessionHydrated = false;
  pendingSaveHydratePromise = null;
}

async function hydratePendingSaveSession(): Promise<void> {
  if (pendingSaveSessionHydrated) {
    return;
  }
  if (!pendingSaveHydratePromise) {
    pendingSaveHydratePromise = (async () => {
      try {
        const bag = await browser.storage.session.get(PENDING_SAVE_SESSION_KEY);
        const raw = bag[PENDING_SAVE_SESSION_KEY] as PendingSaveByTab | undefined;
        if (!raw || typeof raw !== "object") {
          return;
        }
        const now = Date.now();
        for (const [tabKey, pending] of Object.entries(raw)) {
          const tabId = Number(tabKey);
          if (!Number.isFinite(tabId) || !pending?.username || !pending?.password) {
            continue;
          }
          if (now - pending.createdAt > PENDING_SAVE_TTL_MS) {
            continue;
          }
          // Do not clobber a fresher in-memory stage that won the race with storage.get.
          if (pendingSaveByTab.has(tabId)) {
            continue;
          }
          pendingSaveByTab.set(tabId, {
            ...pending,
            websiteUrl: pending.websiteUrl || pending.captureUrl,
          });
        }
      } catch {
        /* session storage unavailable */
      } finally {
        pendingSaveSessionHydrated = true;
      }
    })();
  }
  await pendingSaveHydratePromise;
}

async function persistPendingSaveSession(): Promise<void> {
  const record: PendingSaveByTab = {};
  for (const [tabId, pending] of pendingSaveByTab) {
    record[String(tabId)] = pending;
  }
  try {
    await browser.storage.session.set({ [PENDING_SAVE_SESSION_KEY]: record });
  } catch {
    /* ignore */
  }
}

function isPendingSaveFresh(pending: AutofillPendingSavePayload): boolean {
  return Date.now() - pending.createdAt <= PENDING_SAVE_TTL_MS;
}

function isPendingSaveDismissed(pending: AutofillPendingSavePayload): boolean {
  return Boolean(pending.dismissed || pending.interacted);
}

export async function setPendingSaveOffer(
  tabId: number,
  input: {
    username: string;
    password: string;
    captureUrl: string;
    websiteUrl: string;
    formType?: string;
  },
): Promise<void> {
  await hydratePendingSaveSession();
  const prev = pendingSaveByTab.get(tabId);
  const sameCreds =
    prev &&
    prev.username === input.username &&
    prev.password === input.password &&
    normalizeSaveUrl(prev.captureUrl) === normalizeSaveUrl(input.captureUrl);
  // Fresh stage always clears dismiss — user submitted creds again.
  pendingSaveByTab.set(tabId, {
    username: input.username,
    password: input.password,
    captureUrl: input.captureUrl,
    websiteUrl: input.websiteUrl || input.captureUrl,
    formType: input.formType,
    createdAt: sameCreds && prev ? prev.createdAt : Date.now(),
    dismissed: false,
    interacted: false,
    // Keep offeredKey so redirect restore can dedupe a second identical offer query.
    ...(sameCreds && prev?.offeredKey ? { offeredKey: prev.offeredKey } : {}),
  });
  await persistPendingSaveSession();
}

export async function getPendingSaveOffer(tabId: number): Promise<AutofillPendingSaveGetResponse> {
  await hydratePendingSaveSession();
  const pending = pendingSaveByTab.get(tabId);
  if (!pending || !isPendingSaveFresh(pending)) {
    if (pending) {
      pendingSaveByTab.delete(tabId);
      await persistPendingSaveSession();
    }
    return { status: "none" };
  }
  // Dismissed offers stay in the map briefly so restore can see the flag, then drop.
  if (isPendingSaveDismissed(pending)) {
    pendingSaveByTab.delete(tabId);
    await persistPendingSaveSession();
    return { status: "none" };
  }
  return { status: "ok", pending };
}

export async function clearPendingSaveOffer(tabId: number): Promise<void> {
  await hydratePendingSaveSession();
  if (!pendingSaveByTab.delete(tabId)) {
    return;
  }
  await persistPendingSaveSession();
}

/**
 * Explicit dismiss (save-prompt X). Survives in-flight navigations better than a bare clear
 * when the content script is torn down mid-message — still prefer clearPendingSaveOffer.
 */
export async function markPendingSaveDismissed(tabId: number): Promise<void> {
  await hydratePendingSaveSession();
  const pending = pendingSaveByTab.get(tabId);
  if (!pending || !isPendingSaveFresh(pending)) {
    if (pending) {
      pendingSaveByTab.delete(tabId);
      await persistPendingSaveSession();
    }
    return;
  }
  pending.dismissed = true;
  pending.interacted = true;
  pendingSaveByTab.set(tabId, pending);
  await persistPendingSaveSession();
}

/** @deprecated Destination clicks must not dismiss — use markPendingSaveDismissed / clear. */
export async function markPendingSaveInteracted(tabId: number, _currentUrl: string): Promise<void> {
  // No-op: marking "interacted" on any destination pointer/key was clearing the
  // post-redirect save prompt before restore could paint.
  void tabId;
  void _currentUrl;
}

export function wirePendingSaveTabCleanup(): void {
  browser.tabs.onRemoved.addListener((tabId) => {
    if (!pendingSaveByTab.has(tabId)) {
      return;
    }
    pendingSaveByTab.delete(tabId);
    void persistPendingSaveSession();
  });
}
