export type CryptoRuntimeMode = "dev_test_legacy" | "qday_default";

export interface CryptoConfig {
  version: number;
  id: "v1" | "v2";
  encryptedBlobAlgorithm: "opaque";
  runtimeMode: CryptoRuntimeMode;
  allowedEnvironments: ReadonlyArray<"dev" | "test" | "stage" | "prod">;
}

/** Legacy profile. Vault item read and write paths reject it; v2 is required. */
export const CRYPTO_CONFIG_V1: Readonly<CryptoConfig> = Object.freeze({
  version: 1,
  id: "v1",
  encryptedBlobAlgorithm: "opaque",
  runtimeMode: "dev_test_legacy",
  allowedEnvironments: Object.freeze([] as const),
});
