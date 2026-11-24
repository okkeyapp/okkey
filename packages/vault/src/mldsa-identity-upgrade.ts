import {
  b64Encode,
  decryptUserIdentityFromEncryptedBlob,
  prepareMlDsaIdentityUpgrade,
  wipeBytes,
} from "@okkey/crypto";
import type { MldsaIdentityKeyUploadRequestDto } from "@okkey/types";

import type { StoredVaultBundle } from "./vault-bundle.js";

function isHttpConflict(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: unknown }).status === 409,
  );
}

function wipeIdentity(identity: {
  ed25519SecretKey: Uint8Array;
  mlkem768DecapsulationKey: Uint8Array;
  mldsa65Seed: Uint8Array | null;
}): void {
  wipeBytes(identity.ed25519SecretKey);
  wipeBytes(identity.mlkem768DecapsulationKey);
  if (identity.mldsa65Seed) {
    wipeBytes(identity.mldsa65Seed);
  }
}

async function bundleHasMlDsaSeed(
  vaultKey: Uint8Array,
  bundle: StoredVaultBundle,
): Promise<boolean> {
  const identity = await decryptUserIdentityFromEncryptedBlob(
    vaultKey,
    bundle.encrypted_private_key.payload,
  );
  const present = Boolean(identity.mldsa65Seed && identity.mldsa65Seed.length > 0);
  wipeIdentity(identity);
  return present;
}

/**
 * On unlock, publish an ML-DSA-65 identity key when the local bundle does not have one yet.
 * Failures leave the original bundle in place so unlock can continue.
 */
export async function ensureMlDsaIdentityOnUnlock(input: {
  userId: string;
  vaultKey: Uint8Array;
  bundle: StoredVaultBundle;
  upload: (body: MldsaIdentityKeyUploadRequestDto) => Promise<void>;
  readLatestBundle?: () => Promise<StoredVaultBundle | null>;
}): Promise<StoredVaultBundle> {
  try {
    const local = await decryptUserIdentityFromEncryptedBlob(
      input.vaultKey,
      input.bundle.encrypted_private_key.payload,
    );
    if (local.mldsa65Seed && local.mldsa65Seed.length > 0) {
      wipeIdentity(local);
      return input.bundle;
    }

    if (input.readLatestBundle) {
      const latest = await input.readLatestBundle();
      if (
        latest &&
        latest.encrypted_private_key.payload !== input.bundle.encrypted_private_key.payload &&
        (await bundleHasMlDsaSeed(input.vaultKey, latest))
      ) {
        wipeIdentity(local);
        return latest;
      }
    }

    const prepared = await prepareMlDsaIdentityUpgrade({
      vaultKey: input.vaultKey,
      userId: input.userId,
      ed25519SecretKey: local.ed25519SecretKey,
      mlkem768DecapsulationKey: local.mlkem768DecapsulationKey,
    });
    wipeIdentity(local);
    const body: MldsaIdentityKeyUploadRequestDto = {
      public_key: b64Encode(prepared.publicKey),
      encrypted_private_key: prepared.encryptedPrivateKey,
      signature: b64Encode(prepared.signature),
    };
    try {
      await input.upload(body);
    } catch (error) {
      const conflict = isHttpConflict(error);
      if (conflict && input.readLatestBundle) {
        const latest = await input.readLatestBundle();
        if (latest && (await bundleHasMlDsaSeed(input.vaultKey, latest))) {
          return latest;
        }
      }
      return input.bundle;
    }
    return {
      ...input.bundle,
      encrypted_private_key: prepared.encryptedPrivateKey,
    };
  } catch {
    return input.bundle;
  }
}
