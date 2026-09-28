import { defineBackground } from "wxt/utils/define-background";

import { EXTENSION_DEVICE_CHANNEL } from "../lib/deviceChannel";

export default defineBackground(() => {
  // E0: keep SW alive enough to prove the target loads. Auth / sync / fill come later.
  console.info(`[okkey] background ready (channel=${EXTENSION_DEVICE_CHANNEL})`);
});
