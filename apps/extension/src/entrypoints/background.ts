import { defineBackground } from "wxt/utils/define-background";

import {
  broadcastAutofillUnlocked,
  clearPendingSaveOffer,
  getPendingSaveOffer,
  handleAutofillFill,
  handleAutofillOpenAndFill,
  handleAutofillQuery,
  handleAutofillSave,
  handleAutofillSaveContext,
  handleAutofillSaveFormCommit,
  handleAutofillSaveFormDraft,
  handleAutofillSaveOffer,
  handleAutofillSiteIcon,
  isAutofillRuntimeMessage,
  markPendingSaveDismissed,
  markPendingSaveInteracted,
  openExtensionUnlockPrompt,
  runBackgroundDeviceTrustProbe,
  setPendingSaveOffer,
  wirePendingSaveTabCleanup,
} from "../lib/autofillBroker";
import { clearAllPendingSaveOffers } from "../lib/autofillPendingSave";
import { AUTOFILL_MSG } from "../lib/autofillMessages";
import { EXTENSION_DEVICE_CHANNEL } from "../lib/deviceChannel";
import {
  isClipboardScheduleMessage,
  isOffscreenClearMessage,
  wireExtensionVaultLifecycle,
} from "../lib/extensionVaultLifecycle";
import { EXTENSION_DATA_WIPED_MSG } from "../lib/storage";
import { createCoreClient } from "../lib/api";
import {
  PASSKEY_HANDOFF_JOB_KEY,
  PASSKEY_HANDOFF_START,
  PASSKEY_HANDOFF_STORAGE_KEY,
  PASSKEY_HANDOFF_TIMEOUT_MS,
  isPasskeyHandoffStartMessage,
  pollPasskeyHandoffUntilDone,
  type PasskeyHandoffJob,
  type PasskeyHandoffPollStatus,
  type PasskeyHandoffStored,
} from "../lib/passkeyHandoffPoll";

/** Probe device trust while unlocked so web Revoke clears session without opening the popup. */
const DEVICE_TRUST_ALARM = "okkey.deviceTrustProbe";
const DEVICE_TRUST_PERIOD_MINUTES = 1;

class PasskeyHandoffSuperseded extends Error {}

let passkeyHandoffGeneration = 0;

async function writePasskeyHandoffUi(value: PasskeyHandoffStored): Promise<void> {
  await browser.storage.session.set({ [PASSKEY_HANDOFF_STORAGE_KEY]: value });
}

function handoffReadStatus(error: unknown): PasskeyHandoffPollStatus | null {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }
  const status = Number((error as { status?: unknown }).status);
  if (status === 404 || status === 410) {
    return "expired";
  }
  return "pending";
}

async function runPasskeyHandoffPoll(job: PasskeyHandoffJob): Promise<void> {
  const generation = ++passkeyHandoffGeneration;
  const core = createCoreClient(job.apiBaseUrl, job.accessToken);
  const remaining = PASSKEY_HANDOFF_TIMEOUT_MS - (Date.now() - job.startedAt);
  try {
    const result = await pollPasskeyHandoffUntilDone({
      timeoutMs: Math.max(0, remaining),
      read: async () => {
        if (generation !== passkeyHandoffGeneration) {
          throw new PasskeyHandoffSuperseded();
        }
        try {
          const dto = await core.getPasskeyHandoff(job.deviceId, job.requestId);
          if (dto.status === "confirmed" || dto.status === "rejected" || dto.status === "expired") {
            return dto.status;
          }
          return "pending";
        } catch (error) {
          return handoffReadStatus(error) ?? "pending";
        }
      },
    });
    if (generation !== passkeyHandoffGeneration) {
      return;
    }
    await writePasskeyHandoffUi({
      requestId: job.requestId,
      deviceId: job.deviceId,
      status: result,
    });
    await browser.storage.session.remove(PASSKEY_HANDOFF_JOB_KEY);
  } catch (error) {
    if (error instanceof PasskeyHandoffSuperseded || generation !== passkeyHandoffGeneration) {
      return;
    }
  }
}

async function resumePasskeyHandoffPoll(): Promise<void> {
  const stored = await browser.storage.session.get(PASSKEY_HANDOFF_JOB_KEY);
  const job = stored[PASSKEY_HANDOFF_JOB_KEY] as PasskeyHandoffJob | undefined;
  if (!job || typeof job.requestId !== "string" || typeof job.startedAt !== "number") {
    return;
  }
  if (Date.now() - job.startedAt >= PASSKEY_HANDOFF_TIMEOUT_MS) {
    await writePasskeyHandoffUi({
      requestId: job.requestId,
      deviceId: job.deviceId,
      status: "timeout",
    });
    await browser.storage.session.remove(PASSKEY_HANDOFF_JOB_KEY);
    return;
  }
  await runPasskeyHandoffPoll(job);
}

function startPasskeyHandoff(message: unknown): Promise<{ ok: true }> | undefined {
  if (!isPasskeyHandoffStartMessage(message) || message.type !== PASSKEY_HANDOFF_START) {
    return undefined;
  }
  const job: PasskeyHandoffJob = {
    apiBaseUrl: message.apiBaseUrl,
    accessToken: message.accessToken,
    deviceId: message.deviceId,
    requestId: message.requestId,
    startedAt: Date.now(),
  };
  return (async () => {
    await browser.storage.session.set({ [PASSKEY_HANDOFF_JOB_KEY]: job });
    await writePasskeyHandoffUi({
      requestId: job.requestId,
      deviceId: job.deviceId,
      status: "waiting",
    });
    void runPasskeyHandoffPoll(job);
    return { ok: true as const };
  })();
}

export default defineBackground(() => {
  console.info(`[okkey] background ready (channel=${EXTENSION_DEVICE_CHANNEL})`);
  wirePendingSaveTabCleanup();
  wireExtensionVaultLifecycle();

  void browser.alarms.create(DEVICE_TRUST_ALARM, { periodInMinutes: DEVICE_TRUST_PERIOD_MINUTES });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DEVICE_TRUST_ALARM) {
      void runBackgroundDeviceTrustProbe();
    }
  });
  // Immediate probe on SW wake (MV3) when unlock session may still be present.
  void runBackgroundDeviceTrustProbe();
  void resumePasskeyHandoffPoll();

  browser.runtime.onMessage.addListener((message, sender) => {
    // Handled by wireExtensionVaultLifecycle or the offscreen document — do not swallow.
    if (isClipboardScheduleMessage(message) || isOffscreenClearMessage(message)) {
      return undefined;
    }
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      (message as { type?: unknown }).type === EXTENSION_DATA_WIPED_MSG
    ) {
      return clearAllPendingSaveOffers().then(() => ({ ok: true }));
    }
    if (!isAutofillRuntimeMessage(message)) {
      const handoff = startPasskeyHandoff(message);
      if (handoff) {
        return handoff;
      }
      if (message && typeof message === "object" && "type" in message) {
        return Promise.resolve({ ok: true });
      }
      return undefined;
    }
    if (message.type === AUTOFILL_MSG.query) {
      return handleAutofillQuery(message.pageUrl, message.fieldKinds, message.formType);
    }
    if (message.type === AUTOFILL_MSG.fill) {
      return handleAutofillFill(message.itemId, message.pageUrl, message.fillOverrides);
    }
    if (message.type === AUTOFILL_MSG.unlock) {
      return openExtensionUnlockPrompt().then(() => ({ ok: true }));
    }
    if (message.type === AUTOFILL_MSG.unlocked) {
      return broadcastAutofillUnlocked().then(() => ({ ok: true }));
    }
    if (message.type === AUTOFILL_MSG.save) {
      return handleAutofillSave({
        pageUrl: message.pageUrl,
        websiteUrl: message.websiteUrl,
        title: message.title,
        username: message.username,
        password: message.password,
        vaultId: message.vaultId,
        itemId: message.itemId,
      });
    }
    if (message.type === AUTOFILL_MSG.saveOffer) {
      return handleAutofillSaveOffer({
        pageUrl: message.pageUrl,
        websiteUrl: message.websiteUrl || message.pageUrl,
        username: message.username,
        password: message.password,
      });
    }
    if (message.type === AUTOFILL_MSG.saveContext) {
      return handleAutofillSaveContext();
    }
    if (message.type === AUTOFILL_MSG.saveFormDraft) {
      return handleAutofillSaveFormDraft({
        kind: message.kind,
        title: message.title,
        username: message.username,
        password: message.password,
        websiteUrl: message.websiteUrl,
        vaultId: message.vaultId,
        itemId: message.itemId,
      });
    }
    if (message.type === AUTOFILL_MSG.saveFormCommit) {
      return handleAutofillSaveFormCommit({
        kind: message.kind,
        item: message.item,
      });
    }
    if (message.type === AUTOFILL_MSG.siteIcon) {
      return handleAutofillSiteIcon(message.websiteUrl, message.urls);
    }
    if (message.type === AUTOFILL_MSG.openAndFill) {
      return handleAutofillOpenAndFill(message.itemId, message.url);
    }
    if (message.type === AUTOFILL_MSG.applyFill) {
      // Content script handles applyFill; SW ignores.
      return Promise.resolve({ ok: true });
    }
    const tabId = sender.tab?.id;
    if (message.type === AUTOFILL_MSG.pendingSaveSet) {
      if (tabId == null) {
        return Promise.resolve({ ok: false });
      }
      return setPendingSaveOffer(tabId, {
        username: message.username,
        password: message.password,
        captureUrl: message.captureUrl,
        websiteUrl: message.websiteUrl || message.captureUrl,
        formType: message.formType,
      }).then(() => ({ ok: true }));
    }
    if (message.type === AUTOFILL_MSG.pendingSaveGet) {
      if (tabId == null) {
        return Promise.resolve({ status: "none" as const });
      }
      return getPendingSaveOffer(tabId);
    }
    if (message.type === AUTOFILL_MSG.pendingSaveClear) {
      if (tabId == null) {
        return Promise.resolve({ ok: true });
      }
      return clearPendingSaveOffer(tabId).then(() => ({ ok: true }));
    }
    if (message.type === AUTOFILL_MSG.pendingSaveDismiss) {
      if (tabId == null) {
        return Promise.resolve({ ok: true });
      }
      return markPendingSaveDismissed(tabId).then(() => ({ ok: true }));
    }
    if (message.type === AUTOFILL_MSG.pendingSaveMarkInteracted) {
      if (tabId == null) {
        return Promise.resolve({ ok: true });
      }
      // No-op (legacy): destination clicks must not suppress post-redirect restore.
      return markPendingSaveInteracted(tabId, message.currentUrl).then(() => ({ ok: true }));
    }
    return undefined;
  });
});
