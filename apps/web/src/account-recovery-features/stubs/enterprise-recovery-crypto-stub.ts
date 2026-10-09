/** Core-only stub for `@okkey-enterprise/recovery-crypto` when enterprise repo is absent. */

function unavailable(): never {
  throw new Error("enterprise recovery crypto is not available in Core self-host builds");
}

export function base64ToBytes(..._args: unknown[]): Uint8Array {
  return unavailable();
}

export function wrapVaultKeyForDeviceRequest(..._args: unknown[]): never {
  return unavailable();
}

export function unsealContactShare(..._args: unknown[]): never {
  return unavailable();
}

export function wipeBytes(..._args: unknown[]): void {
  /* no-op */
}

export function wrapShareForRelease(..._args: unknown[]): never {
  return unavailable();
}
