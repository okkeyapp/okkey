import type { IncomingMessage } from "node:http";

import { requestClientIp } from "../request-ip.ts";

export type InvitePreviewRateLimit = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
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
  const count = await rateLimit.incr(key);
  if (count === 1) {
    await rateLimit.expire(key, rateLimit.windowSeconds);
  }
  if (count > rateLimit.maxPerIp) {
    return { status: "limited", retryAfterSeconds: rateLimit.windowSeconds };
  }
  return { status: "ok" };
}
