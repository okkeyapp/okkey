/**
 * Hybrid wrap for split-key share B.
 *
 * Share B is an XOR term of VaultKey (A ⊕ B ⊕ C). The user identity private
 * key is sealed under VaultKey, so this hop cannot be addressed to that
 * identity key. It is addressed to a device wrap key (Ed25519→X25519 +
 * ML-KEM-768) that lives outside the vault, using the same `encrypt_hybrid`
 * / `decrypt_hybrid` envelope as vault-key wraps and a distinct AAD.
 *
 * Stored bytes are either exactly 32 legacy bytes or a framed envelope.
 * New seals are framed envelopes only.
 */
import {
  decrypt_hybrid,
  ed25519_keypair,
  ed25519_public_to_x25519,
  ed25519_secret_to_x25519,
  encrypt_hybrid,
  random_bytes,
} from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";
import {
  encodeSplitKeyShareBFrame,
  classifySplitKeyShareBWire,
  splitKeyShareBEnvelope,
  SPLIT_KEY_SHARE_B_LEGACY_LEN,
} from "./split-key-share-frame.js";
import { wipeBytes } from "./secret-buffer.js";
import { generateMlkem768KeypairMaterial } from "./user-identity-bundle.js";
import { ensureWasm } from "./wasm-init.js";

const SHARE_LEN = SPLIT_KEY_SHARE_B_LEGACY_LEN;

/** Distinct from `okkey-vault-key-wrap-v1`. */
export const SPLIT_KEY_SHARE_B_AAD = new TextEncoder().encode("okkey-split-key-share-b-v1");

export const SPLIT_KEY_SHARE_B_WRAP_SCHEME = "hybrid_ecc_pq_v1" as const;

export type SplitKeyShareWrapKey = {
  ed25519Seed: Uint8Array;
  ed25519PublicKey: Uint8Array;
  mlkemDecapsulationKey: Uint8Array;
  mlkemEncapsulationKey: Uint8Array;
};

export async function generateSplitKeyShareWrapKey(): Promise<SplitKeyShareWrapKey> {
  await ensureWasm();
  const ed = ed25519_keypair();
  const mlkem = await generateMlkem768KeypairMaterial();
  try {
    if (ed.length !== 64) {
      throw new Error("unexpected Ed25519 keypair length");
    }
    return {
      ed25519Seed: ed.slice(0, 32),
      ed25519PublicKey: ed.slice(32, 64),
      mlkemDecapsulationKey: mlkem.decapsulationKey,
      mlkemEncapsulationKey: mlkem.encapsulationKey,
    };
  } finally {
    wipeBytes(ed);
  }
}

export async function wrapSplitKeyShareB(input: {
  share: Uint8Array;
  recipientEd25519PublicKey: Uint8Array;
  recipientMlkemEncapsulationKey: Uint8Array;
}): Promise<Uint8Array> {
  await ensureWasm();
  if (input.share.length !== SHARE_LEN) {
    throw new Error("device share must be 32 bytes");
  }
  if (input.recipientEd25519PublicKey.length !== 32) {
    throw new Error("recipient Ed25519 public key must be 32 bytes");
  }
  const shareCopy = input.share.slice();
  try {
    const recipientX25519 = ed25519_public_to_x25519(input.recipientEd25519PublicKey);
    let envelope: Uint8Array | null = null;
    try {
      try {
        envelope = encrypt_hybrid(
          new Uint8Array(32),
          recipientX25519,
          input.recipientMlkemEncapsulationKey,
          SPLIT_KEY_SHARE_B_AAD,
          shareCopy,
        );
      } catch (error) {
        throw mapWasmError("wrapSplitKeyShareB", error);
      }
      return encodeSplitKeyShareBFrame({
        ed25519PublicKey: input.recipientEd25519PublicKey,
        mlkemEncapsulationKey: input.recipientMlkemEncapsulationKey,
        envelope,
      });
    } finally {
      wipeBytes(recipientX25519);
      if (envelope) {
        wipeBytes(envelope);
      }
    }
  } finally {
    wipeBytes(shareCopy);
  }
}

/**
 * Read share B. Exactly 32 bytes is the legacy plaintext.
 * A hybrid frame or bare envelope decrypts with the device wrap key.
 */
export async function openStoredSplitKeyShareB(input: {
  stored: Uint8Array;
  recipientEd25519Seed?: Uint8Array;
  recipientMlkemDecapsulationKey?: Uint8Array;
}): Promise<Uint8Array> {
  await ensureWasm();
  const kind = classifySplitKeyShareBWire(input.stored);
  if (kind === "legacy") {
    return input.stored.slice();
  }
  if (kind !== "hybrid") {
    throw new Error("invalid stored split-key share B");
  }
  const seed = input.recipientEd25519Seed;
  const dk = input.recipientMlkemDecapsulationKey;
  if (!seed || seed.length !== 32 || !dk || dk.length === 0) {
    throw new Error("device wrap key is required to open a hybrid share B");
  }
  const envelope = splitKeyShareBEnvelope(input.stored);
  if (!envelope) {
    throw new Error("invalid stored split-key share B");
  }
  let x25519Private: Uint8Array;
  try {
    x25519Private = ed25519_secret_to_x25519(seed);
  } catch (error) {
    throw mapWasmError("openStoredSplitKeyShareB", error);
  }
  let share: Uint8Array;
  try {
    try {
      share = decrypt_hybrid(x25519Private, dk, SPLIT_KEY_SHARE_B_AAD, envelope);
    } catch (error) {
      throw mapWasmError("openStoredSplitKeyShareB", error);
    }
  } finally {
    wipeBytes(x25519Private);
  }
  if (share.length !== SHARE_LEN) {
    wipeBytes(share);
    throw new Error("hybrid share B plaintext must be 32 bytes");
  }
  return share;
}

/** Seal a fresh 32-byte share to a new device wrap key. */
export async function sealSplitKeyShareB(share: Uint8Array): Promise<{
  wrapped: Uint8Array;
  shareWrap: SplitKeyShareWrapKey;
}> {
  if (share.length !== SHARE_LEN) {
    throw new Error("device share must be 32 bytes");
  }
  const shareWrap = await generateSplitKeyShareWrapKey();
  const wrapped = await wrapSplitKeyShareB({
    share,
    recipientEd25519PublicKey: shareWrap.ed25519PublicKey,
    recipientMlkemEncapsulationKey: shareWrap.mlkemEncapsulationKey,
  });
  return { wrapped, shareWrap };
}

export async function randomSplitKeyShare(): Promise<Uint8Array> {
  await ensureWasm();
  return random_bytes(SHARE_LEN);
}
