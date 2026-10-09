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
  handleAutofillSaveOffer,
  handleAutofillSiteIcon,
  isAutofillRuntimeMessage,
  markPendingSaveDismissed,
  markPendingSaveInteracted,
  openExtensionUnlockPrompt,
  setPendingSaveOffer,
  wirePendingSaveTabCleanup,
} from "../lib/autofillBroker";
import { AUTOFILL_MSG } from "../lib/autofillMessages";
import { EXTENSION_DEVICE_CHANNEL } from "../lib/deviceChannel";

export default defineBackground(() => {
  console.info(`[okkey] background ready (channel=${EXTENSION_DEVICE_CHANNEL})`);
  wirePendingSaveTabCleanup();

  browser.runtime.onMessage.addListener((message, sender) => {
    if (!isAutofillRuntimeMessage(message)) {
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
    if (message.type === AUTOFILL_MSG.siteIcon) {
      return handleAutofillSiteIcon(message.websiteUrl);
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
