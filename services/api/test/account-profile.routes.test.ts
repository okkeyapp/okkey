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

function createUsersRepositoryStub(): Pick<
  UsersRepository,
  "loadAccountProfile" | "updateAccountProfile" | "updateMasterPasswordShares"
> {
  let state = {
    email: "user@example.com",
    firstName: "Ann" as string | null,
    lastName: "Bee" as string | null,
    locale: "en" as string | null,
    billingRegion: "US" as string | null,
    vaultIdleLockSeconds: 900,
    masterPasswordChangedAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    async loadAccountProfile(userId: string) {
      if (userId !== "u1") {
        return null;
      }
      return state;
    },
    async updateAccountProfile(userId, patch) {
      if (userId !== "u1") {
        return null;
      }
      state = {
        ...state,
        firstName: Object.prototype.hasOwnProperty.call(patch, "firstName") ? patch.firstName ?? null : state.firstName,
        lastName: Object.prototype.hasOwnProperty.call(patch, "lastName") ? patch.lastName ?? null : state.lastName,
        locale: Object.prototype.hasOwnProperty.call(patch, "locale") ? patch.locale ?? null : state.locale,
        billingRegion: Object.prototype.hasOwnProperty.call(patch, "billingRegion")
          ? patch.billingRegion ?? null
          : state.billingRegion,
        vaultIdleLockSeconds: Object.prototype.hasOwnProperty.call(patch, "vaultIdleLockSeconds")
          ? patch.vaultIdleLockSeconds ?? state.vaultIdleLockSeconds
          : state.vaultIdleLockSeconds,
      };
      return state;
    },
    async updateMasterPasswordShares(userId) {
      if (userId !== "u1") {
        return null;
      }
      state = {
        ...state,
        masterPasswordChangedAt: "2026-03-02T21:59:00.000Z",
      };
      return state.masterPasswordChangedAt;
    },
  };
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  vaultService?: VaultService;
  sessionService?: SessionService;
  usersRepository?: Pick<
    UsersRepository,
    "loadAccountProfile" | "updateAccountProfile" | "updateMasterPasswordShares"
  >;
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
    body: input.body,
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
    locale: string | null;
    billing_region: string | null;
    vault_idle_lock_seconds: number;
  };
  assert.equal(payload.email, "user@example.com");
  assert.equal(payload.first_name, "Ann");
  assert.equal(payload.last_name, "Bee");
  assert.equal(payload.locale, "en");
  assert.equal(payload.billing_region, "US");
  assert.equal(payload.vault_idle_lock_seconds, 900);
  assert.equal(payload.master_password_changed_at, "2026-01-01T00:00:00.000Z");
});

test("PATCH /account/profile updates display preferences", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/account/profile",
    sessionService: createSessionServiceStub(),
    usersRepository: createUsersRepositoryStub(),
    headers: { authorization: "Bearer test-access-token" },
    body: {
      first_name: " Sasha ",
      last_name: "",
      locale: "ru",
      billing_region: "de",
    },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as {
    first_name: string | null;
    last_name: string | null;
    locale: string | null;
    billing_region: string | null;
  };
  assert.equal(payload.first_name, "Sasha");
  assert.equal(payload.last_name, null);
  assert.equal(payload.locale, "ru");
  assert.equal(payload.billing_region, "DE");
});

test("PATCH /account/profile updates vault_idle_lock_seconds", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/account/profile",
    sessionService: createSessionServiceStub(),
    usersRepository: createUsersRepositoryStub(),
    headers: { authorization: "Bearer test-access-token" },
    body: { vault_idle_lock_seconds: 1800 },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { vault_idle_lock_seconds: number };
  assert.equal(payload.vault_idle_lock_seconds, 1800);
});

test("POST /account/master-password/change updates shares", async () => {
  const share = Buffer.alloc(32, 7).toString("base64");
  const salt = Buffer.alloc(16, 9).toString("base64");
  const res = await dispatch({
    method: "POST",
    url: "/account/master-password/change",
    sessionService: createSessionServiceStub(),
    usersRepository: createUsersRepositoryStub(),
    headers: { authorization: "Bearer test-access-token" },
    body: {
      server_key_share: share,
      password_kdf_salt: salt,
      password_kdf_params_version: 1,
    },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { master_password_changed_at: string };
  assert.equal(payload.master_password_changed_at, "2026-03-02T21:59:00.000Z");
});

test("PATCH /account/profile rejects invalid payload", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/account/profile",
    sessionService: createSessionServiceStub(),
    usersRepository: createUsersRepositoryStub(),
    headers: { authorization: "Bearer test-access-token" },
    body: {
      locale: "fr",
      billing_region: "USA",
    },
  });

  assert.equal(res.statusCode, 400);
});
