import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { AuthError, AuthService } from "../src/auth/service.ts";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import { resetEgressPublicIpCache } from "../src/capsule/geoip.ts";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class InMemoryRedis {
  private readonly counters = new Map<string, number>();
  private readonly values = new Map<string, string>();

  async setWithTtl(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExistsWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.values.has(key)) {
      return false;
    }
    await this.setWithTtl(key, value, ttlSeconds);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<boolean> {
    return true;
  }
}

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(_name: string, _value: string): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const peerAddress = "203.0.113.50";

function createAuthService(config: ApiConfig): AuthService {
  let nextId = 1;
  return new AuthService({
    redis: new InMemoryRedis(),
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => true,
    },
    emailTemplates: {
      sendAuthEmailCode: async () => {},
    },
    config,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "123456",
    generateId: () => `id-${nextId++}`,
  });
}

async function startEmail(input: {
  config: ApiConfig;
  authService: AuthService;
  email: string;
  forwardedFor: string;
}): Promise<number> {
  const app = createApiApp(input.config, loggerStub(), { authService: input.authService });
  const req = {
    method: "POST",
    url: "/auth/email/start",
    headers: { "x-forwarded-for": input.forwardedFor },
    body: { email: input.email },
    socket: { remoteAddress: peerAddress },
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res.statusCode;
}

test("OTP start rate limit uses TCP address when TRUSTED_PROXY_HOPS=0", async () => {
  const config = createTestApiConfig({
    authRateLimitStartPerIp: 2,
    authRateLimitStartPerEmail: 20,
    authRateLimitWindowSeconds: 600,
    trustedProxyHops: 0,
  });
  const authService = createAuthService(config);
  const first = await startEmail({
    config,
    authService,
    email: "one@example.com",
    forwardedFor: "198.51.100.1",
  });
  const second = await startEmail({
    config,
    authService,
    email: "two@example.com",
    forwardedFor: "198.51.100.2",
  });
  const third = await startEmail({
    config,
    authService,
    email: "three@example.com",
    forwardedFor: "198.51.100.3",
  });

  assert.equal(first, 200);
  assert.equal(second, 200);
  assert.equal(
    third,
    429,
    "a client-supplied forwarded header must not open a new OTP rate-limit bucket",
  );
});

function createCapsuleService(config: ApiConfig): CapsuleService {
  return new CapsuleService({
    db: {
      query: async () => {
        throw new Error("database should not be reached after the open limit");
      },
      transaction: async () => {
        throw new Error("database should not be reached after the open limit");
      },
    },
    redis: new InMemoryRedis(),
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
      deleteObject: async () => {},
    },
    config,
  });
}

test("capsule open limit keeps the socket address when the peer is not loopback", async () => {
  const service = createCapsuleService(
    createTestApiConfig({ trustedProxyHops: 0, capsuleOpenRateLimitPerIp: 1 }),
  );
  const context = await service.resolveRequesterContext({
    remoteAddress: peerAddress,
    forwardedFor: "198.51.100.10",
  });
  assert.equal(context.ipAddress, peerAddress);
});

test("capsule password and open limits use TCP address when TRUSTED_PROXY_HOPS=0", async () => {
  // Use a non-loopback peer so resolveClientIpForGeo does not hit live egress
  // lookup (ipify), which made this assertion flake when one call got 127.0.0.1
  // and the next got the runner public IP.
  resetEgressPublicIpCache();
  const tcpPeer = "10.0.0.42";
  const service = createCapsuleService(
    createTestApiConfig({
      trustedProxyHops: 0,
      capsuleOpenRateLimitPerIp: 1,
      capsuleRateLimitWindowSeconds: 60,
    }),
  );
  const first = await service.resolveRequesterContext({
    remoteAddress: tcpPeer,
    forwardedFor: "198.51.100.10",
  });
  const second = await service.resolveRequesterContext({
    remoteAddress: tcpPeer,
    forwardedFor: "203.0.113.20",
  });
  assert.equal(first.ipAddress, tcpPeer);
  assert.equal(
    first.ipAddress,
    second.ipAddress,
    "a client-supplied forwarded header must not select a new capsule client address",
  );

  await service.openCapsule("capsule-1", first.ipAddress).catch((error: unknown) => {
    if (error instanceof CapsuleServiceError && error.code === "RATE_LIMITED") {
      return;
    }
  });
  await assert.rejects(
    () => service.openCapsule("capsule-1", second.ipAddress),
    (error: unknown) => error instanceof CapsuleServiceError && error.code === "RATE_LIMITED",
  );
});

test("AuthError rate-limit code stays 429", () => {
  const error = new AuthError("AUTH_RATE_LIMITED", 429, "rate limited");
  assert.equal(error.statusCode, 429);
});
