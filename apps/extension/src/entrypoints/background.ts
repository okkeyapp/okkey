import { defineBackground } from "wxt/utils/define-background";

import {
  broadcastAutofillUnlocked,
  handleAutofillFill,
  handleAutofillOpenAndFill,
  handleAutofillQuery,
  handleAutofillSave,
  handleAutofillSaveContext,
  handleAutofillSiteIcon,
  isAutofillRuntimeMessage,
  openExtensionUnlockPrompt,
} from "../lib/autofillBroker";
import { AUTOFILL_MSG } from "../lib/autofillMessages";
import { EXTENSION_DEVICE_CHANNEL } from "../lib/deviceChannel";

export default defineBackground(() => {
  console.info(`[okkey] background ready (channel=${EXTENSION_DEVICE_CHANNEL})`);

  browser.runtime.onMessage.addListener((message) => {
    if (!isAutofillRuntimeMessage(message)) {
      if (message && typeof message === "object" && "type" in message) {
        return Promise.resolve({ ok: true });
      }
      return undefined;
    }
    if (message.type === AUTOFILL_MSG.query) {
      return handleAutofillQuery(message.pageUrl);
    }
    if (message.type === AUTOFILL_MSG.fill) {
      return handleAutofillFill(message.itemId, message.pageUrl);
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
    return undefined;
  });
});
