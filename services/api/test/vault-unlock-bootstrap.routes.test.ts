import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import {
  VaultUnlockBootstrapError,
  type VaultUnlockBootstrapService,
} from "../src/account/vault-unlock-bootstrap.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import type { SessionService } from "../src/session/service.ts";
import type { VaultService } from "../src/vault/service.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

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

const config: ApiConfig = createTestApiConfig();

function createVaultServiceStub(): VaultService {
  return {
    listAccessibleWorkspaces: async () => [],
    listWorkspaceVaults: async () => [],
    getVault: async () => {
      throw new Error("not used");
    },
  } as unknown as VaultService;
}

function createSessionServiceStub(): SessionService {
  return {
    async resolveAccessToken(token: string) {
      if (token.trim() === "test-access-token") {
        return { userId: "u1" };
      }
      return null;
    },
  } as unknown as SessionService;
}

function createBootstrapOkStub(): VaultUnlockBootstrapService {
  return {
    async getForUser() {
      return {
        server_key_share: Buffer.alloc(32, 1).toString("base64"),
        device_share: Buffer.alloc(32, 2).toString("base64"),
        password_kdf_salt: Buffer.alloc(16, 3).toString("base64"),
        password_kdf_params_version: 2,
        encrypted_private_key: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.alloc(32, 4).toString("base64"),
          meta: {},
        },
      };
    },
  } as unknown as VaultUnlockBootstrapService;
}

function createBootstrapNotFoundStub(): VaultUnlockBootstrapService {
  return {
    async getForUser() {
      throw new VaultUnlockBootstrapError(
        "VAULT_UNLOCK_DEVICE_NOT_FOUND",
        404,
        "no trusted device match for unlock bootstrap",
      );
    },
  } as unknown as VaultUnlockBootstrapService;
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  vaultService?: VaultService;
  sessionService?: SessionService;
  vaultUnlockBootstrapService: VaultUnlockBootstrapService;
}) {
  const app = createApiApp(config, loggerStub(), {
    vaultService: input.vaultService ?? createVaultServiceStub(),
    ...(input.sessionService !== undefined ? { sessionService: input.sessionService } : {}),
    vaultUnlockBootstrapService: input.vaultUnlockBootstrapService,
  });
  const req = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
  } as IncomingMessage;
  const res = new MockResponse();

  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("GET /vault/unlock-bootstrap without auth returns 401", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vault/unlock-bootstrap",
    vaultUnlockBootstrapService: createBootstrapOkStub(),
  });

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_REQUIRED");
});

test("GET /vault/unlock-bootstrap with auth returns 200 and payload", async () => {
  const fp = "a".repeat(64);
  const res = await dispatch({
    method: "GET",
    url: `/vault/unlock-bootstrap?device_fingerprint=${fp}`,
    headers: { authorization: "Bearer test-access-token" },
    sessionService: createSessionServiceStub(),
    vaultUnlockBootstrapService: createBootstrapOkStub(),
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as {
    server_key_share: string;
    device_share: string;
    password_kdf_salt: string;
    password_kdf_params_version: number;
    encrypted_private_key: { payload: string };
  };
  assert.equal(typeof payload.server_key_share, "string");
  assert.equal(typeof payload.device_share, "string");
  assert.equal(payload.password_kdf_params_version, 2);
});

test("GET /vault/unlock-bootstrap maps VaultUnlockBootstrapError to status", async () => {
  const fp = "b".repeat(64);
  const res = await dispatch({
    method: "GET",
    url: `/vault/unlock-bootstrap?device_fingerprint=${fp}`,
    headers: { authorization: "Bearer test-access-token" },
    sessionService: createSessionServiceStub(),
    vaultUnlockBootstrapService: createBootstrapNotFoundStub(),
  });

  assert.equal(res.statusCode, 404);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_UNLOCK_DEVICE_NOT_FOUND");
});
