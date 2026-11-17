import type { IncomingMessage } from "node:http";

import { requestClientIp } from "../request-ip.ts";

export type ApprovalStatusRateLimit = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  windowSeconds: number;
  pollMaxPerIp: number;
  pollMaxPerDevice: number;
  retryMaxPerIp: number;
  retryMaxPerDevice: number;
  trustedProxyHops: number;
};

export type ApprovalStatusRateLimitResult =
  | { status: "ok" }
  | { status: "limited"; retryAfterSeconds: number };

/** Enough for a 5s poll across the 30 minute credential lifetime, with headroom. */
export const APPROVAL_STATUS_POLL_MAX_PER_DEVICE = 180;
export const APPROVAL_STATUS_POLL_MAX_PER_IP = 360;
export const APPROVAL_STATUS_RETRY_MAX_PER_DEVICE = 5;
export const APPROVAL_STATUS_RETRY_MAX_PER_IP = 10;

export function createMemoryRateCounter(): Pick<ApprovalStatusRateLimit, "incr" | "expire"> {
  const counts = new Map<string, number>();
  return {
    async incr(key: string): Promise<number> {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async expire(key: string, seconds: number): Promise<boolean> {
      if (seconds > 0) {
        const current = key;
        setTimeout(() => {
          counts.delete(current);
        }, seconds * 1000).unref?.();
      }
      return true;
    },
  };
}

async function consume(
  rateLimit: ApprovalStatusRateLimit,
  key: string,
  max: number,
): Promise<ApprovalStatusRateLimitResult> {
  const count = await rateLimit.incr(key);
  if (count === 1) {
    await rateLimit.expire(key, rateLimit.windowSeconds);
  }
  if (count > max) {
    return { status: "limited", retryAfterSeconds: rateLimit.windowSeconds };
  }
  return { status: "ok" };
}

/** Per-device and per-IP budgets for status polling or a new approval request. */
export async function enforceApprovalStatusRateLimit(
  req: IncomingMessage,
  rateLimit: ApprovalStatusRateLimit,
  deviceId: string,
  kind: "poll" | "retry",
): Promise<ApprovalStatusRateLimitResult> {
  const ip = requestClientIp(req, rateLimit.trustedProxyHops) || "unknown";
  const ipMax = kind === "poll" ? rateLimit.pollMaxPerIp : rateLimit.retryMaxPerIp;
  const deviceMax = kind === "poll" ? rateLimit.pollMaxPerDevice : rateLimit.retryMaxPerDevice;
  const ipResult = await consume(rateLimit, `device-approval-status:${kind}:ip:${ip}`, ipMax);
  if (ipResult.status === "limited") {
    return ipResult;
  }
  return consume(rateLimit, `device-approval-status:${kind}:device:${deviceId}`, deviceMax);
}
