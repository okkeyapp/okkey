import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import type { SessionService } from "../src/session/service.ts";
import type { UsersRepository } from "../src/storage/repositories.ts";
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

function createUsersRepositoryStub(): Pick<UsersRepository, "loadAccountProfile"> {
  return {
    async loadAccountProfile(userId: string) {
      if (userId !== "u1") {
        return null;
      }
      return {
        email: "user@example.com",
        firstName: "Ann",
        lastName: "Bee",
      };
    },
  };
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  vaultService?: VaultService;
  sessionService?: SessionService;
  usersRepository?: Pick<UsersRepository, "loadAccountProfile">;
}) {
  const app = createApiApp(config, loggerStub(), {
    vaultService: input.vaultService ?? createVaultServiceStub(),
    ...(input.sessionService !== undefined ? { sessionService: input.sessionService } : {}),
    ...(input.usersRepository !== undefined ? { usersRepository: input.usersRepository } : {}),
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

test("GET /account/profile without auth returns 401", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/account/profile",
    sessionService: createSessionServiceStub(),
    usersRepository: createUsersRepositoryStub(),
  });

  assert.equal(res.statusCode, 401);
});

test("GET /account/profile without usersRepository is not routed (404)", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/account/profile",
    sessionService: createSessionServiceStub(),
    headers: { authorization: "Bearer test-access-token" },
  });

  assert.equal(res.statusCode, 404);
});

test("GET /account/profile with auth returns profile", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/account/profile",
    sessionService: createSessionServiceStub(),
    usersRepository: createUsersRepositoryStub(),
    headers: { authorization: "Bearer test-access-token" },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as {
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  assert.equal(payload.email, "user@example.com");
  assert.equal(payload.first_name, "Ann");
  assert.equal(payload.last_name, "Bee");
});
