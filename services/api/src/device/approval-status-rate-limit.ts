import type { IncomingMessage } from "node:http";

import { requestClientIp } from "../request-ip.ts";
import {
  incrementFixedWindow,
  type FixedWindowCounterRedis,
} from "../storage/fixed-window-counter.ts";

export type ApprovalStatusRateLimit = FixedWindowCounterRedis & {
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

export function createMemoryRateCounter(): FixedWindowCounterRedis {
  const counts = new Map<string, number>();
  const expirations = new Map<string, number>();

  function purgeIfExpired(key: string): void {
    const expiresAt = expirations.get(key);
    if (expiresAt !== undefined && Date.now() >= expiresAt) {
      counts.delete(key);
      expirations.delete(key);
    }
  }

  return {
    async setIfNotExistsWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean> {
      purgeIfExpired(key);
      if (counts.has(key)) {
        return false;
      }
      counts.set(key, Number(value) || 0);
      if (ttlSeconds > 0) {
        expirations.set(key, Date.now() + ttlSeconds * 1000);
      }
      return true;
    },
    async incr(key: string): Promise<number> {
      purgeIfExpired(key);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async ttl(key: string): Promise<number> {
      purgeIfExpired(key);
      if (!counts.has(key)) {
        return -2;
      }
      const expiresAt = expirations.get(key);
      if (expiresAt === undefined) {
        return -1;
      }
      return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    },
    async expire(key: string, seconds: number): Promise<boolean> {
      purgeIfExpired(key);
      if (!counts.has(key)) {
        return false;
      }
      if (seconds > 0) {
        expirations.set(key, Date.now() + seconds * 1000);
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
  const count = await incrementFixedWindow(rateLimit, key, rateLimit.windowSeconds);
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
