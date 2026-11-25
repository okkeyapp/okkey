import type { IncomingMessage } from "node:http";

import { requestClientIp } from "../request-ip.ts";
import {
  incrementFixedWindow,
  type FixedWindowCounterRedis,
} from "../storage/fixed-window-counter.ts";

export type InvitePreviewRateLimit = FixedWindowCounterRedis & {
  windowSeconds: number;
  maxPerIp: number;
  /** Honor X-Forwarded-For only when > 0 (same as core requestClientIp). */
  trustedProxyHops: number;
};

export type InvitePreviewRateLimitResult =
  | { status: "ok" }
  | { status: "limited"; retryAfterSeconds: number };

/**
 * Apply per-IP invite preview rate limit.
 * Uses the TCP remote address unless TRUSTED_PROXY_HOPS > 0.
 */
export async function enforceInvitePreviewRateLimit(
  req: IncomingMessage,
  rateLimit: InvitePreviewRateLimit,
): Promise<InvitePreviewRateLimitResult> {
  const ip = requestClientIp(req, rateLimit.trustedProxyHops);
  const key = `invite:preview:ip:${ip}`;
  const count = await incrementFixedWindow(rateLimit, key, rateLimit.windowSeconds);
  if (count > rateLimit.maxPerIp) {
    return { status: "limited", retryAfterSeconds: rateLimit.windowSeconds };
  }
  return { status: "ok" };
}
