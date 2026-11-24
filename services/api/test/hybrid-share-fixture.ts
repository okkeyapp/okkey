import { encodeSplitKeyShareBFrame } from "@okkey/crypto";

/** Framed hybrid share-B envelope accepted by the API transport policy. */
export function hybridDeviceShareBytes(fill = 3): Uint8Array {
  return hybridDeviceShareBytesForKeys(
    new Uint8Array(32).fill(fill & 0xff),
    new Uint8Array(1184).fill(fill & 0xff),
    fill,
  );
}

/** Same wrap public keys as `pending`, but a different envelope (not a reused share). */
export function hybridDeviceShareBytesForKeys(
  ed25519PublicKey: Uint8Array,
  mlkemEncapsulationKey: Uint8Array,
  envelopeFill = 3,
): Uint8Array {
  const envelope = new Uint8Array(1148 + 48);
  envelope[0] = 1;
  envelope[1] = 1;
  envelope[2] = 1;
  envelope[3] = 0;
  envelope.fill(envelopeFill & 0xff, 4);
  return encodeSplitKeyShareBFrame({
    ed25519PublicKey,
    mlkemEncapsulationKey,
    envelope,
  });
}

export function hybridDeviceShareB64(fill = 3): string {
  return Buffer.from(hybridDeviceShareBytes(fill)).toString("base64");
}
