import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import { SyncServiceError, type SyncService } from "../src/sync/service.ts";

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
  context: "sync.append",
  signer_pq_public_key: "cHE=",
  payload_hash: "aGFzaA==",
  signature: "c2ln",
  created_at: "2026-01-01T00:00:00.000Z",
};

function mkBlob(payload = "x", cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {},
  };
}

function createSyncServiceStub(overrides?: Partial<SyncService>): SyncService {
  return {
    listEvents: async () => [
      {
        id: "e1",
        vaultId: "v1",
        actorId: "u1",
        eventType: "ITEM_CREATE",
        encryptedBlob: mkBlob("x", 1),
        idempotencyKey: null,
        clientCreatedAt: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    appendEvent: async () => ({
      id: "e2",
      vaultId: "v1",
      actorId: "u1",
      eventType: "ITEM_UPDATE",
      encryptedBlob: mkBlob("x", 1),
      idempotencyKey: null,
      clientCreatedAt: null,
      version: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    ...(overrides ?? {}),
  } as unknown as SyncService;
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  syncService?: SyncService;
}) {
  const app = createApiApp(config, loggerStub(), {
    syncService: input.syncService ?? createSyncServiceStub(),
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

test("GET /vaults/:vaultId/events returns events", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/events?afterVersion=0",
    headers: { "x-user-id": "u1" },
  });

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { events: Array<{ id: string }> };
  assert.equal(payload.events[0].id, "e1");
});

test("POST /vaults/:vaultId/events appends event", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "ITEM_UPDATE",
      encryptedBlob: mkBlob("x"),
      baseVersion: 1,
    },
  });

  assert.equal(res.statusCode, 201);
  const payload = JSON.parse(res.body) as { id: string; version: number };
  assert.equal(payload.id, "e2");
  assert.equal(payload.version, 2);
});

test("sync routes require x-user-id", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/events?afterVersion=0",
  });

  assert.equal(res.statusCode, 401);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_REQUIRED");
});

test("POST /vaults/:vaultId/events validates required fields", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: { eventType: "ITEM_UPDATE" },
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "SYNC_BAD_REQUEST");
});

test("sync routes map VERSION_MISMATCH", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "ITEM_UPDATE",
      encryptedBlob: mkBlob("x"),
      baseVersion: 1,
    },
    syncService: createSyncServiceStub({
      appendEvent: async () => {
        throw new SyncServiceError("VERSION_MISMATCH", 409, "baseVersion is stale");
      },
    }),
  });

  assert.equal(res.statusCode, 409);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VERSION_MISMATCH");
});

test("GET /vaults/:vaultId/events maps ACCESS_DENIED", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/events?afterVersion=0",
    headers: { "x-user-id": "u1" },
    syncService: createSyncServiceStub({
      listEvents: async () => {
        throw new SyncServiceError("ACCESS_DENIED", 403, "access denied");
      },
    }),
  });

  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "ACCESS_DENIED");
});

test("GET /vaults/:vaultId/events maps VAULT_NOT_FOUND", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/v1/events?afterVersion=0",
    headers: { "x-user-id": "u1" },
    syncService: createSyncServiceStub({
      listEvents: async () => {
        throw new SyncServiceError("VAULT_NOT_FOUND", 404, "vault not found");
      },
    }),
  });

  assert.equal(res.statusCode, 404);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "VAULT_NOT_FOUND");
});

test("POST /vaults/:vaultId/events maps ACCESS_DENIED", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "ITEM_UPDATE",
      encryptedBlob: mkBlob("x"),
      baseVersion: 0,
    },
    syncService: createSyncServiceStub({
      appendEvent: async () => {
        throw new SyncServiceError("ACCESS_DENIED", 403, "access denied");
      },
    }),
  });

  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "ACCESS_DENIED");
});

test("POST /vaults/:vaultId/events maps PAYLOAD_TOO_LARGE", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "ITEM_UPDATE",
      encryptedBlob: mkBlob("x"),
      baseVersion: 0,
    },
    syncService: createSyncServiceStub({
      appendEvent: async () => {
        throw new SyncServiceError("PAYLOAD_TOO_LARGE", 413, "payload too large");
      },
    }),
  });

  assert.equal(res.statusCode, 413);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "PAYLOAD_TOO_LARGE");
});

test("POST /vaults/:vaultId/events maps CRYPTO_DOWNGRADE_NOT_ALLOWED", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "ITEM_UPDATE",
      encryptedBlob: mkBlob("x", 1),
      baseVersion: 0,
    },
    syncService: createSyncServiceStub({
      appendEvent: async () => {
        throw new SyncServiceError(
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

test("POST /vaults/:vaultId/events requires signature for VAULT_SHARE", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "VAULT_SHARE",
      encryptedBlob: mkBlob("x", 2),
      baseVersion: 0,
    },
  });

  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "SIGNATURE_REQUIRED");
});

test("POST /vaults/:vaultId/events accepts signature for VAULT_KEY_ROTATION", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/v1/events",
    headers: { "x-user-id": "u1" },
    body: {
      eventType: "VAULT_KEY_ROTATION",
      encryptedBlob: mkBlob("x", 2),
      signature: signatureStub,
      baseVersion: 1,
    },
  });

  assert.equal(res.statusCode, 201);
});
