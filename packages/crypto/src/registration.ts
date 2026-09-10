/**
 * Client-side registration crypto: split-key VaultKey = A ⊕ B ⊕ C (32-byte XOR),
 * C = Argon2id(master_password, salt). Backend receives only A and encrypted artifacts.
 */
import initWasm, {
  b64_encode,
  ed25519_keypair,
  kdf_derive,
  random_bytes,
} from "@okkey/crypto-wasm";
import type { EncryptedBlobDto } from "@okkey/types";
import {
  encryptUserIdentityPrivateBundle,
  encodeUserIdentityPrivateBundleV1,
  generateMlkem768KeypairMaterial,
  userIdentityEncryptedBlobDtoFromPayload,
} from "./user-identity-bundle.js";

const SHARE_LEN = 32;
const KDF_SALT_LEN = 16;

/** Matches `rust/crypto-engine` default Argon2id params (version 1 on wire). */
export const OKKEY_PASSWORD_KDF_PARAMS_V1 = {
  mCost: 19456,
  tCost: 2,
  pCost: 1,
} as const;

export const OKKEY_PASSWORD_KDF_PARAMS_VERSION = 1 as const;

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

function xor32(a: Uint8Array, b: Uint8Array, c: Uint8Array): Uint8Array {
  const out = new Uint8Array(SHARE_LEN);
  for (let i = 0; i < SHARE_LEN; i++) {
    out[i] = a[i] ^ b[i] ^ c[i];
  }
  return out;
}

export interface RegistrationSplitKeyMaterial {
  serverKeyShare: Uint8Array;
  deviceShare: Uint8Array;
  passwordKdfSalt: Uint8Array;
  passwordKdfParamsVersion: typeof OKKEY_PASSWORD_KDF_PARAMS_VERSION;
}

export interface RegistrationUserKeyMaterial {
  userPublicKey: Uint8Array;
  userPublicPqKey: Uint8Array;
  encryptedPrivateKey: Uint8Array;
}

export async function buildRegistrationCryptoArtifacts(
  masterPasswordUtf8: Uint8Array,
): Promise<RegistrationSplitKeyMaterial & RegistrationUserKeyMaterial & { vaultKey: Uint8Array }> {
  await ensureWasm();

  const vaultKey = random_bytes(SHARE_LEN);
  const serverShareA = random_bytes(SHARE_LEN);
  const passwordKdfSalt = random_bytes(KDF_SALT_LEN);

  const passwordShareC = kdf_derive(
    masterPasswordUtf8,
    passwordKdfSalt,
    OKKEY_PASSWORD_KDF_PARAMS_V1.mCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.tCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.pCost,
    SHARE_LEN,
  );

  const deviceShareB = xor32(serverShareA, passwordShareC, vaultKey);

  const edSeedPk = ed25519_keypair();
  const signingPrivateKey = edSeedPk.slice(0, 32);
  const userPublicKey = edSeedPk.slice(32, 64);

  const mlkem = await generateMlkem768KeypairMaterial();
  const plaintextBundle = encodeUserIdentityPrivateBundleV1(signingPrivateKey, mlkem.decapsulationKey);
  const encryptedPrivateKey = await encryptUserIdentityPrivateBundle(vaultKey, plaintextBundle);

  return {
    vaultKey,
    serverKeyShare: serverShareA,
    deviceShare: deviceShareB,
    passwordKdfSalt,
    passwordKdfParamsVersion: OKKEY_PASSWORD_KDF_PARAMS_VERSION,
    userPublicKey,
    userPublicPqKey: mlkem.encapsulationKey,
    encryptedPrivateKey,
  };
}

/**
 * Recover the 32-byte password share **C** from master password and KDF salt.
 */
export async function derivePasswordShareC(input: {
  masterPasswordUtf8: Uint8Array;
  passwordKdfSalt: Uint8Array;
  passwordKdfParamsVersion: number;
}): Promise<Uint8Array> {
  await ensureWasm();
  if (input.passwordKdfSalt.length !== KDF_SALT_LEN) {
    throw new Error("passwordKdfSalt must be 16 bytes");
  }
  if (input.passwordKdfParamsVersion !== 1 && input.passwordKdfParamsVersion !== 2) {
    throw new Error("unsupported passwordKdfParamsVersion for unlock");
  }
  return kdf_derive(
    input.masterPasswordUtf8,
    input.passwordKdfSalt,
    OKKEY_PASSWORD_KDF_PARAMS_V1.mCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.tCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.pCost,
    SHARE_LEN,
  );
}

/**
 * Recover `VaultKey` from master password and split-key shares (same XOR model as registration).
 * `passwordKdfParamsVersion` must be supported on the wire (`1` or `2`); Argon2id parameters match {@link OKKEY_PASSWORD_KDF_PARAMS_V1} for both in current Core.
 */
export async function reconstructVaultKeyWithMasterPassword(input: {
  masterPasswordUtf8: Uint8Array;
  serverKeyShare: Uint8Array;
  deviceShare: Uint8Array;
  passwordKdfSalt: Uint8Array;
  passwordKdfParamsVersion: number;
}): Promise<Uint8Array> {
  await ensureWasm();
  if (input.serverKeyShare.length !== SHARE_LEN || input.deviceShare.length !== SHARE_LEN) {
    throw new Error("serverKeyShare and deviceShare must be 32 bytes");
  }

  const passwordShareC = await derivePasswordShareC({
    masterPasswordUtf8: input.masterPasswordUtf8,
    passwordKdfSalt: input.passwordKdfSalt,
    passwordKdfParamsVersion: input.passwordKdfParamsVersion,
  });

  return xor32(input.serverKeyShare, input.deviceShare, passwordShareC);
}

export type RebalanceServerShareForNewPasswordResult = {
  /** New password share C' (caller must wipe after use). */
  passwordShareC: Uint8Array;
  /** New server share A' = VaultKey ⊕ B ⊕ C'. */
  serverKeyShare: Uint8Array;
  passwordKdfSalt: Uint8Array;
  passwordKdfParamsVersion: typeof OKKEY_PASSWORD_KDF_PARAMS_VERSION;
};

/**
 * Keep `VaultKey` and device share **B** fixed; derive new **C'** and rebalance server share **A'**.
 * Used for master-password change without re-wrapping vault items or identity.
 */
export async function rebalanceServerShareForNewPassword(input: {
  newMasterPasswordUtf8: Uint8Array;
  vaultKey: Uint8Array;
  deviceShare: Uint8Array;
  passwordKdfParamsVersion?: number;
}): Promise<RebalanceServerShareForNewPasswordResult> {
  await ensureWasm();
  if (input.vaultKey.length !== SHARE_LEN || input.deviceShare.length !== SHARE_LEN) {
    throw new Error("vaultKey and deviceShare must be 32 bytes");
  }
  const paramsVersion = input.passwordKdfParamsVersion ?? OKKEY_PASSWORD_KDF_PARAMS_VERSION;
  if (paramsVersion !== 1 && paramsVersion !== 2) {
    throw new Error("unsupported passwordKdfParamsVersion for password change");
  }

  const passwordKdfSalt = random_bytes(KDF_SALT_LEN);
  const passwordShareC = await derivePasswordShareC({
    masterPasswordUtf8: input.newMasterPasswordUtf8,
    passwordKdfSalt,
    passwordKdfParamsVersion: paramsVersion,
  });
  const serverKeyShare = xor32(input.vaultKey, input.deviceShare, passwordShareC);

  return {
    passwordShareC,
    serverKeyShare,
    passwordKdfSalt,
    passwordKdfParamsVersion: OKKEY_PASSWORD_KDF_PARAMS_VERSION,
  };
}

export function registrationArtifactsToWire(
  material: RegistrationSplitKeyMaterial & RegistrationUserKeyMaterial,
): {
  user_public_key: string;
  user_public_pq_key: string;
  encrypted_private_key: EncryptedBlobDto;
  server_key_share: string;
  password_kdf_salt: string;
  password_kdf_params_version: number;
} {
  return {
    user_public_key: b64_encode(material.userPublicKey),
    user_public_pq_key: b64_encode(material.userPublicPqKey),
    encrypted_private_key: userIdentityEncryptedBlobDtoFromPayload(material.encryptedPrivateKey),
    server_key_share: b64_encode(material.serverKeyShare),
    password_kdf_salt: b64_encode(material.passwordKdfSalt),
    password_kdf_params_version: material.passwordKdfParamsVersion,
  };
}
