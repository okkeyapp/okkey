import { defineBackground } from "wxt/utils/define-background";

import { EXTENSION_DEVICE_CHANNEL } from "../lib/deviceChannel";

export default defineBackground(() => {
  console.info(`[okkey] background ready (channel=${EXTENSION_DEVICE_CHANNEL})`);

  // Popup polls storage after callback; keep SW awake enough to receive runtime messages later.
  browser.runtime.onMessage.addListener((message) => {
    if (message && typeof message === "object" && "type" in message) {
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });
});
