import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";

import { enforceInvitePreviewRateLimit } from "../src/workspace-members/invite-preview-rate-limit.ts";

class InMemoryRateLimit {
  private readonly counters = new Map<string, number>();
  readonly keys: string[] = [];

  async incr(key: string): Promise<number> {
    this.keys.push(key);
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<boolean> {
    return true;
  }
}

function request(remoteAddress: string, forwardedFor?: string): IncomingMessage {
  const headers: Record<string, string> = {};
  if (forwardedFor !== undefined) {
    headers["x-forwarded-for"] = forwardedFor;
  }
  return {
    headers,
    socket: { remoteAddress },
  } as IncomingMessage;
}

test("invite preview rate limit uses TCP address when TRUSTED_PROXY_HOPS=0", async () => {
  const rateLimit = new InMemoryRateLimit();
  const peer = "203.0.113.50";
  const config = {
    incr: (key: string) => rateLimit.incr(key),
    expire: (key: string, seconds: number) => rateLimit.expire(key, seconds),
    windowSeconds: 600,
    maxPerIp: 2,
    trustedProxyHops: 0,
  };

  assert.deepEqual(await enforceInvitePreviewRateLimit(request(peer, "198.51.100.1"), config), {
    status: "ok",
  });
  assert.deepEqual(await enforceInvitePreviewRateLimit(request(peer, "198.51.100.2"), config), {
    status: "ok",
  });
  assert.deepEqual(await enforceInvitePreviewRateLimit(request(peer, "198.51.100.3"), config), {
    status: "limited",
    retryAfterSeconds: 600,
  });
  assert.deepEqual(rateLimit.keys, [
    `invite:preview:ip:${peer}`,
    `invite:preview:ip:${peer}`,
    `invite:preview:ip:${peer}`,
  ]);
});

test("invite preview rate limit honors X-Forwarded-For when TRUSTED_PROXY_HOPS>0", async () => {
  const rateLimit = new InMemoryRateLimit();
  const config = {
    incr: (key: string) => rateLimit.incr(key),
    expire: (key: string, seconds: number) => rateLimit.expire(key, seconds),
    windowSeconds: 600,
    maxPerIp: 1,
    trustedProxyHops: 1,
  };

  assert.deepEqual(
    await enforceInvitePreviewRateLimit(request("10.0.0.1", "198.51.100.10"), config),
    { status: "ok" },
  );
  assert.deepEqual(
    await enforceInvitePreviewRateLimit(request("10.0.0.1", "203.0.113.20"), config),
    { status: "ok" },
  );
  assert.deepEqual(rateLimit.keys, [
    "invite:preview:ip:198.51.100.10",
    "invite:preview:ip:203.0.113.20",
  ]);
});
