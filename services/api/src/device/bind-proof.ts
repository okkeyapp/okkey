import { randomBytes } from "node:crypto";
import { ed25519Verify } from "@okkey/crypto";

export const DEVICE_BIND_CHALLENGE_TTL_SECONDS = 120;
const BIND_DOMAIN = "okkey-device-bind-v1";

export type DeviceBindChallengeRecord = {
  messageB64: string;
  deviceId: string;
  tokenHash: string;
  expiresAtMs: number;
};

export {
  MemoryDeviceBindChallengeStore,
  RedisDeviceBindChallengeStore,
  type DeviceBindChallengeStore,
} from "./bind-challenge-store.ts";

export function deviceBindChallengeKey(
  tokenHash: string,
  deviceId: string,
  challengeId: string,
): string {
  return `device-bind:${tokenHash}:${deviceId}:${challengeId}`;
}

export function deviceBindMessage(input: {
  challengeId: string;
  deviceId: string;
  tokenHash: string;
  nonceB64: string;
}): Uint8Array {
  return new TextEncoder().encode(
    `${BIND_DOMAIN}\n${input.challengeId}\n${input.deviceId}\n${input.tokenHash}\n${input.nonceB64}`,
  );
}

export function issueDeviceBindChallenge(input: {
  deviceId: string;
  tokenHash: string;
  nowMs: number;
  ttlSeconds?: number;
}): { challengeId: string; message: Uint8Array; record: DeviceBindChallengeRecord; expiresAt: string } {
  const challengeId = randomBytes(16).toString("hex");
  const nonceB64 = randomBytes(32).toString("base64");
  const message = deviceBindMessage({
    challengeId,
    deviceId: input.deviceId,
    tokenHash: input.tokenHash,
    nonceB64,
  });
  const ttlSeconds = input.ttlSeconds ?? DEVICE_BIND_CHALLENGE_TTL_SECONDS;
  const expiresAtMs = input.nowMs + ttlSeconds * 1000;
  return {
    challengeId,
    message,
    expiresAt: new Date(expiresAtMs).toISOString(),
    record: {
      messageB64: Buffer.from(message).toString("base64"),
      deviceId: input.deviceId,
      tokenHash: input.tokenHash,
      expiresAtMs,
    },
  };
}

function decodeBase64(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return null;
  }
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== trimmed.replace(/=+$/, "")) {
    return null;
  }
  return new Uint8Array(bytes);
}

export function verifyDeviceBindSignature(
  publicKeyB64: string,
  message: Uint8Array,
  signatureB64: string,
): boolean {
  const publicKey = decodeBase64(publicKeyB64);
  const signature = decodeBase64(signatureB64);
  if (!publicKey || publicKey.length !== 32 || !signature || signature.length !== 64) {
    return false;
  }
  try {
    return ed25519Verify(publicKey, message, signature);
  } catch {
    return false;
  }
}
