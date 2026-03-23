import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import type { SessionService } from "../src/session/service.ts";
import { VaultServiceError, type VaultService } from "../src/vault/service.ts";

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

function createVaultServiceStub(
  overrides?: Partial<VaultService>,
): VaultService {
  return {
    listWorkspaceVaults: async () => [
      {
        id: "v1",
        workspaceId: "w1",
        name: "Personal",
        isPersonal: true,
        ownerId: "u1",
        createdAt: "",
        updatedAt: "",
      },
    ],
    getVault: async () => ({
      id: "v1",
      workspaceId: "w1",
      name: "Personal",
      isPersonal: true,
      ownerId: "u1",
      createdAt: "",
      updatedAt: "",
    }),
    ...(overrides ?? {}),
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

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  vaultService?: VaultService;
  sessionService?: SessionService;
}) {
  const app = createApiApp(config, loggerStub(), {
    vaultService: input.vaultService ?? createVaultServiceStub(),
    ...(input.sessionService !== undefined ? { sessionService: input.sessionService } : {}),
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

test("GET /workspaces/:workspaceId/vaults returns vault list", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/workspaces/w1/vaults",
    headers: { "x-user-id": "u1" },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as Array<{ id: string }>;
  assert.equal(payload[0].id, "v1");
});

test("GET /workspaces/:workspaceId/vaults accepts Authorization Bearer", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/workspaces/w1/vaults",
    headers: { authorization: "Bearer test-access-token" },
    sessionService: createSessionServiceStub(),
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as Array<{ id: string }>;
  assert.equal(payload[0].id, "v1");
});

test("GET /vaults/:vaultId returns vault", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1",
    headers: { "x-user-id": "u1" },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { id: string };
  assert.equal(payload.id, "v1");
});

test("vault routes require auth", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1",
  });

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_REQUIRED");
});

test("vault routes map access errors", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1",
    headers: { "x-user-id": "u2" },
    vaultService: createVaultServiceStub({
      getVault: async () => {
        throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
      },
    }),
  });

  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "ACCESS_DENIED");
});
