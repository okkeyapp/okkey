import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import type { VaultSharingService } from "../src/vault-sharing/service.ts";

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

function createSharingStub(overrides?: Partial<VaultSharingService>): VaultSharingService {
  return {
    getUserVaultKey: async () => ({ encryptedVaultKey: Buffer.from("k").toString("base64") }),
    listVaultShares: async () => [],
    shareVault: async () => {},
    revokeVaultAccess: async () => {},
    rotateVaultKey: async () => {},
    updateVaultMemberRole: async () => {},
    ...(overrides ?? {}),
  } as unknown as VaultSharingService;
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  sharingService?: VaultSharingService;
}) {
  const sharing = input.sharingService ?? createSharingStub();
  const app = createApiApp(config, loggerStub(), {
    vaultSharingService: sharing,
  });
  const req = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    ...(input.body !== undefined ? { body: input.body } : {}),
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("GET /vaults/:vaultId/key returns encrypted key", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/key",
    headers: { "x-user-id": "u1" },
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { encryptedVaultKey: string };
  assert.equal(Buffer.from(payload.encryptedVaultKey, "base64").toString("utf8"), "k");
});

test("paid shared-vault routes are 404 without enterprise plugin", async () => {
  for (const [method, url] of [
    ["POST", "/workspaces/w1/vaults"],
    ["DELETE", "/vaults/v1"],
    ["GET", "/vaults/v1/access"],
    ["PUT", "/vaults/v1/access"],
    ["GET", "/vaults/v1/shares"],
    ["POST", "/vaults/v1/shares"],
    ["POST", "/vaults/v1/shares/revoke"],
    ["POST", "/vaults/v1/key/rotate"],
    ["PATCH", "/vaults/v1/shares/u2"],
  ] as const) {
    const res = await dispatch({
      method,
      url,
      headers: { "x-user-id": "u1", "content-type": "application/json" },
      body: {},
    });
    assert.equal(res.statusCode, 404, `${method} ${url}`);
  }
});

test("paid member invite routes are 404 without enterprise plugin", async () => {
  for (const [method, url] of [
    ["POST", "/workspaces/w1/invitations"],
    ["DELETE", "/workspaces/w1/invitations/i1"],
    ["PATCH", "/workspaces/w1/invitations/i1"],
    ["GET", "/workspaces/w1/invitations/i1/vault-access"],
    ["PUT", "/workspaces/w1/invitations/i1/vault-access"],
    ["PATCH", "/workspaces/w1/members/u2"],
    ["DELETE", "/workspaces/w1/members/u2"],
    ["GET", "/workspaces/w1/members/u2/vault-access"],
    ["PUT", "/workspaces/w1/members/u2/vault-access"],
  ] as const) {
    const res = await dispatch({
      method,
      url,
      headers: { "x-user-id": "u1", "content-type": "application/json" },
      body: {},
    });
    assert.equal(res.statusCode, 404, `${method} ${url}`);
  }
});
