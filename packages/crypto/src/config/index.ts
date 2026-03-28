import { CryptoSdkError } from "../errors.js";
import { CRYPTO_CONFIG_V1, type CryptoConfig } from "./v1.js";
import { CRYPTO_CONFIG_V2 } from "./v2.js";

const REGISTRY = Object.freeze(
  new Map<number, Readonly<CryptoConfig>>([
    [CRYPTO_CONFIG_V1.version, CRYPTO_CONFIG_V1],
    [CRYPTO_CONFIG_V2.version, CRYPTO_CONFIG_V2],
  ]),
);

export function getCryptoConfig(version: number): Readonly<CryptoConfig> {
  const config = REGISTRY.get(version);
  if (!config) {
    throw new CryptoSdkError(
      "UNSUPPORTED_ALGORITHM",
      `unsupported crypto profile version: v${version}`,
    );
  }
  return config;
}

export function listCryptoConfigs(): ReadonlyArray<Readonly<CryptoConfig>> {
  return Object.freeze(Array.from(REGISTRY.values()));
}

export type { CryptoConfig } from "./v1.js";
