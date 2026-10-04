import { defineBackground } from "wxt/utils/define-background";

import {
  broadcastAutofillUnlocked,
  handleAutofillFill,
  handleAutofillQuery,
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
    return undefined;
  });
});
