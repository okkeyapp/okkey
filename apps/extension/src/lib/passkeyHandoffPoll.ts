import { isPasskeyHandoffRequestId, PASSKEY_HANDOFF_TTL_MS } from "@okkey/types";

/** Matches the server handoff TTL so the popup does not wait past a dead request. */
export const PASSKEY_HANDOFF_TIMEOUT_MS = PASSKEY_HANDOFF_TTL_MS;
export const PASSKEY_HANDOFF_POLL_INTERVAL_MS = 2_000;

export const PASSKEY_HANDOFF_START = "okkey.passkeyHandoff.start";
export const PASSKEY_HANDOFF_STORAGE_KEY = "okkey.passkeyHandoff.v1";
export const PASSKEY_HANDOFF_JOB_KEY = "okkey.passkeyHandoff.job";

export type PasskeyHandoffPollStatus = "pending" | "confirmed" | "rejected" | "expired";
export type PasskeyHandoffPollResult = "confirmed" | "rejected" | "expired" | "timeout";

export type PasskeyHandoffUiStatus = "waiting" | PasskeyHandoffPollResult;

export type PasskeyHandoffStored = {
  requestId: string;
  deviceId: string;
  status: PasskeyHandoffUiStatus;
};

export type PasskeyHandoffJob = {
  apiBaseUrl: string;
  accessToken: string;
  deviceId: string;
  requestId: string;
  startedAt: number;
};

export type PasskeyHandoffStartMessage = {
  type: typeof PASSKEY_HANDOFF_START;
  apiBaseUrl: string;
  accessToken: string;
  deviceId: string;
  requestId: string;
};

export function isPasskeyHandoffStartMessage(value: unknown): value is PasskeyHandoffStartMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    row.type === PASSKEY_HANDOFF_START &&
    typeof row.apiBaseUrl === "string" &&
    row.apiBaseUrl.trim() !== "" &&
    typeof row.accessToken === "string" &&
    row.accessToken.trim() !== "" &&
    typeof row.deviceId === "string" &&
    row.deviceId.trim() !== "" &&
    typeof row.requestId === "string" &&
    isPasskeyHandoffRequestId(row.requestId)
  );
}

export function passkeyHandoffPageUrl(webBaseUrl: string, requestId: string): string {
  const url = new URL("/account/passkey-approval", webBaseUrl.replace(/\/$/, "") + "/");
  url.searchParams.set("request", requestId);
  return url.toString();
}

/**
 * Poll a handoff status until it is terminal or the client window elapses.
 * `timeout` is the client outcome when the status stays pending for the whole window.
 */
export async function pollPasskeyHandoffUntilDone(input: {
  read: () => Promise<PasskeyHandoffPollStatus>;
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<PasskeyHandoffPollResult> {
  const intervalMs = input.intervalMs ?? PASSKEY_HANDOFF_POLL_INTERVAL_MS;
  const timeoutMs = input.timeoutMs ?? PASSKEY_HANDOFF_TIMEOUT_MS;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? (() => Date.now());
  const started = now();
  while (now() - started < timeoutMs) {
    const status = await input.read();
    if (status === "confirmed" || status === "rejected" || status === "expired") {
      return status;
    }
    const remaining = timeoutMs - (now() - started);
    if (remaining <= 0) {
      break;
    }
    await sleep(Math.min(intervalMs, remaining));
  }
  return "timeout";
}
