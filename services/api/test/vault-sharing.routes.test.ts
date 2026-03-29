import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import type { VaultSharingService } from "../src/vault-sharing/service.ts";
import { VaultSharingServiceError } from "../src/vault-sharing/service.ts";

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
const signatureStub = {
  version: 1,
  algorithm: "hybrid_ed25519_pq_bind_v1",
  key_id: "k1",
  context: "vault.rotate",
  signer_pq_public_key: "cHE=",
  payload_hash: "aGFzaA==",
  signature: "c2ln",
  created_at: "2026-01-01T00:00:00.000Z",
};

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
  const app = createApiApp(config, loggerStub(), {
    vaultSharingService: input.sharingService ?? createSharingStub(),
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

test("POST /vaults/:vaultId/shares requires body fields", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/shares",
    headers: { "x-user-id": "u1" },
    body: { recipientUserId: "u2" },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_SHARE_BAD_REQUEST");
});

test("vault sharing routes map domain errors", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/shares",
    headers: { "x-user-id": "u1" },
    sharingService: createSharingStub({
      listVaultShares: async () => {
        throw new VaultSharingServiceError("VAULT_SHARE_FORBIDDEN", 403, "forbidden");
      },
    }),
  });
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_SHARE_FORBIDDEN");
});

test("POST /vaults/:vaultId/shares maps CRYPTO_DOWNGRADE_NOT_ALLOWED", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/shares",
    headers: { "x-user-id": "u1" },
    body: {
      recipientUserId: "u2",
      encryptedVaultKey: { crypto_version: 1, algorithm: "opaque", payload: "a", meta: {} },
      encryptedPayload: { crypto_version: 1, algorithm: "opaque", payload: "a", meta: {} },
      signature: { ...signatureStub, context: "vault.share" },
      baseVersion: 0,
    },
    sharingService: createSharingStub({
      shareVault: async () => {
        throw new VaultSharingServiceError(
          "CRYPTO_DOWNGRADE_NOT_ALLOWED",
          400,
          "crypto profile downgrade blocked",
          { reason: "downgrade" },
        );
      },
    }),
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string; details?: { reason?: string } };
  assert.equal(payload.error, "CRYPTO_DOWNGRADE_NOT_ALLOWED");
  assert.equal(payload.details?.reason, "downgrade");
});

test("POST /vaults/:vaultId/key/rotate requires body fields", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/key/rotate",
    headers: { "x-user-id": "u1" },
    body: { rotatedVaultKeys: [] },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_SHARE_BAD_REQUEST");
});

test("POST /vaults/:vaultId/key/rotate rejects empty rotatedVaultKeys array", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/key/rotate",
    headers: { "x-user-id": "u1" },
    body: {
      rotatedVaultKeys: [],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} },
      signature: { ...signatureStub, context: "vault.rotate" },
      baseVersion: 0,
    },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_SHARE_BAD_REQUEST");
});

test("POST /vaults/:vaultId/key/rotate returns 200 on success", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/key/rotate",
    headers: { "x-user-id": "u1" },
    body: {
      rotatedVaultKeys: [
        { userId: "u1", encryptedVaultKey: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} } },
      ],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "b", meta: {} },
      signature: { ...signatureStub, context: "vault.rotate" },
      baseVersion: 0,
      reason: "manual",
    },
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { rotated: boolean };
  assert.equal(payload.rotated, true);
});

test("POST /vaults/:vaultId/key/rotate maps domain errors", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/key/rotate",
    headers: { "x-user-id": "u1" },
    body: {
      rotatedVaultKeys: [
        { userId: "u1", encryptedVaultKey: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} } },
      ],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "b", meta: {} },
      signature: { ...signatureStub, context: "vault.rotate" },
      baseVersion: 0,
    },
    sharingService: createSharingStub({
      rotateVaultKey: async () => {
        throw new VaultSharingServiceError("VAULT_KEY_WRAP_INVALID", 400, "missing recipients");
      },
    }),
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_KEY_WRAP_INVALID");
});

test("POST /vaults/:vaultId/key/rotate requires auth", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/key/rotate",
    body: {
      rotatedVaultKeys: [
        { userId: "u1", encryptedVaultKey: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} } },
      ],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "b", meta: {} },
      signature: { ...signatureStub, context: "vault.rotate" },
      baseVersion: 0,
    },
  });
  assert.equal(res.statusCode, 401);
});

test("PATCH /vaults/:vaultId/shares/:userId requires body fields", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/vaults/v1/shares/u2",
    headers: { "x-user-id": "u1" },
    body: { newRole: "admin" },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_SHARE_BAD_REQUEST");
});

test("PATCH /vaults/:vaultId/shares/:userId rejects empty rotatedVaultKeys array", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/vaults/v1/shares/u2",
    headers: { "x-user-id": "u1" },
    body: {
      newRole: "admin",
      rotatedVaultKeys: [],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} },
      signature: { ...signatureStub, context: "vault.member_role_update" },
      baseVersion: 0,
    },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_SHARE_BAD_REQUEST");
});

test("PATCH /vaults/:vaultId/shares/:userId returns 200 on success", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/vaults/v1/shares/u2",
    headers: { "x-user-id": "u1" },
    body: {
      newRole: "admin",
      rotatedVaultKeys: [
        { userId: "u1", encryptedVaultKey: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} } },
      ],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "b", meta: {} },
      signature: { ...signatureStub, context: "vault.member_role_update" },
      baseVersion: 0,
    },
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { updated: boolean };
  assert.equal(payload.updated, true);
});

test("PATCH /vaults/:vaultId/shares/:userId maps domain errors", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/vaults/v1/shares/u2",
    headers: { "x-user-id": "u1" },
    body: {
      newRole: "member",
      rotatedVaultKeys: [
        { userId: "u1", encryptedVaultKey: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} } },
      ],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "b", meta: {} },
      signature: { ...signatureStub, context: "vault.member_role_update" },
      baseVersion: 0,
    },
    sharingService: createSharingStub({
      updateVaultMemberRole: async () => {
        throw new VaultSharingServiceError("MEMBERSHIP_CONFLICT", 409, "member not found");
      },
    }),
  });
  assert.equal(res.statusCode, 409);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "MEMBERSHIP_CONFLICT");
});

test("PATCH /vaults/:vaultId/shares/:userId requires auth", async () => {
  const res = await dispatch({
    method: "PATCH",
    url: "/vaults/v1/shares/u2",
    body: {
      newRole: "admin",
      rotatedVaultKeys: [
        { userId: "u1", encryptedVaultKey: { crypto_version: 2, algorithm: "opaque", payload: "a", meta: {} } },
      ],
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "b", meta: {} },
      signature: { ...signatureStub, context: "vault.member_role_update" },
      baseVersion: 0,
    },
  });
  assert.equal(res.statusCode, 401);
});
