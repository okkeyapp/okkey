import type { CryptoConfig } from "./v1.js";

export const CRYPTO_CONFIG_V2: Readonly<CryptoConfig> = Object.freeze({
  version: 2,
  id: "v2",
  encryptedBlobAlgorithm: "opaque",
  runtimeMode: "qday_default",
  allowedEnvironments: Object.freeze(["dev", "test", "stage", "prod"] as const),
});
