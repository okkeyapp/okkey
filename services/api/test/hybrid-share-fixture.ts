import { encodeSplitKeyShareBFrame } from "@okkey/crypto";

/** Framed hybrid share-B envelope accepted by the API transport policy. */
export function hybridDeviceShareBytes(fill = 3): Uint8Array {
  const envelope = new Uint8Array(1148 + 48);
  envelope[0] = 1;
  envelope[1] = 1;
  envelope[2] = 1;
  envelope[3] = 0;
  envelope[4] = fill & 0xff;
  return encodeSplitKeyShareBFrame({
    ed25519PublicKey: new Uint8Array(32).fill(fill & 0xff),
    mlkemEncapsulationKey: new Uint8Array(1184).fill(fill & 0xff),
    envelope,
  });
}

export function hybridDeviceShareB64(fill = 3): string {
  return Buffer.from(hybridDeviceShareBytes(fill)).toString("base64");
}
