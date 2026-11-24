import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import { STORAGE_QUOTA_BYTES_PER_MIB } from "../../../packages/types/src/plan-features.ts";
import { AttachmentService } from "../src/attachments/service.ts";
import { createApiApp } from "../src/app.ts";
import { SyncService } from "../src/sync/service.ts";
import { WorkspaceStorageQuotaService } from "../src/storage-quota/service.ts";
import type { QueryExecutor } from "../src/storage/postgres.ts";
import type { KeyFieldFileStorage } from "../src/storage/key-field-file-storage.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import { testEntityId } from "./test-entity-id.ts";

const WORKSPACE_ID = "1000000000000000101";
const VAULT_ID = "1000000000000000102";
const ITEM_ID = "1000000000000000103";
const USER_ID = "1000000000000000104";
const ATTACHMENT_ID = "1000000000000000105";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = Buffer.alloc(0);

  setHeader(): void {}

  end(chunk?: string | Buffer): void {
    if (chunk) {
      const next = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.body = Buffer.concat([this.body, next]);
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

function quotaDb(usedBytes: number): QueryExecutor {
  return {
    async query<T>(sql: string): Promise<T[]> {
      if (sql.includes("workspace_members")) {
        return [{ count: "1" }] as T[];
      }
      if (sql.includes("used_bytes")) {
        return [{ used_bytes: String(usedBytes) }] as T[];
      }
      if (sql.includes("AS excluded")) {
        return [] as T[];
      }
      throw new Error(`unexpected storage quota query: ${sql}`);
    },
  };
}

function throwingDb(): QueryExecutor {
  return {
    async query(): Promise<never[]> {
      throw new Error("storage quota must not query on this path");
    },
  };
}

function mkBlob(payload = "note") {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {},
  };
}

function workspaceRecord(planTier: string) {
  return {
    id: WORKSPACE_ID,
    name: "Workspace",
    ownerId: USER_ID,
    planTier,
    planCustomOverride: false,
    planFeatureOverrides: {},
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: [] as string[],
    maxFileSizeMb: 32,
    filesInItemsEnabled: true,
    capsulePolicies: {
      allowMode: "all" as const,
      allowMemberIds: [],
      allowedCapsuleTypes: ["text", "file", "item"] as const,
      forceMaxViews: 0,
      passwordAttemptLimit: 0,
    },
    monitoringCardSettings: {},
    tileColor: null,
    logoVaultId: null,
    logoAttachmentId: null,
    createdAt: "",
    updatedAt: "",
  };
}

function vaultRecord() {
  return {
    id: VAULT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Personal",
    description: "",
    icon: "",
    isPersonal: true,
    ownerId: USER_ID,
    cryptoVersion: 2,
    createdAt: "",
    updatedAt: "",
  };
}

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  syncService?: SyncService;
  attachmentService?: AttachmentService;
}) {
  const app = createApiApp(createTestApiConfig(), loggerStub(), {
    syncService: input.syncService,
    attachmentService: input.attachmentService,
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

function saasSyncService(usedBytes: number): SyncService {
  return new SyncService({
    config: createTestApiConfig({ deploymentMode: "saas", enterpriseModulesEnabled: false }),
    storageQuota: new WorkspaceStorageQuotaService({
      db: quotaDb(usedBytes),
      config: { deploymentMode: "saas", enterpriseModulesEnabled: false },
    }),
    vaults: {
      findById: async () => vaultRecord(),
      canReadVault: async () => true,
    },
    workspaces: {
      findById: async () => workspaceRecord("FREE"),
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      append: async (input) => ({
        id: testEntityId(),
        vaultId: input.vaultId,
        actorId: input.actorId ?? null,
        eventType: input.eventType,
        encryptedPayload: input.encryptedPayload,
        payloadSchemaVersion: input.payloadSchemaVersion ?? 2,
        idempotencyKey: input.idempotencyKey ?? null,
        clientCreatedAt: input.clientCreatedAt ?? null,
        referencedItemId: input.referencedItemId ?? null,
        itemSoftDeleted: input.itemSoftDeleted ?? null,
        version: input.baseVersion + 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    },
  });
}

function selfHostAttachmentService(): AttachmentService {
  const storage = {
    async upload(params: { fileName: string; sizeBytes?: number; body: Uint8Array }) {
      return {
        attachmentId: ATTACHMENT_ID,
        storageKey: `attachments/${VAULT_ID}/${ATTACHMENT_ID}`,
        name: params.fileName,
        mimeType: "application/pdf",
        sizeBytes: params.sizeBytes ?? params.body.byteLength,
      };
    },
    async deleteByStorageKey() {},
  } as unknown as KeyFieldFileStorage;
  return new AttachmentService({
    storage,
    attachments: {
      async create(record) {
        return {
          id: record.id,
          vaultId: record.vaultId,
          itemId: record.itemId,
          storageKey: record.storageKey,
          encryptedKey: record.encryptedKey,
          size: record.size,
          purpose: record.purpose,
          createdAt: "",
        };
      },
      async deleteByVaultItemAndId() {
        return {
          id: ATTACHMENT_ID,
          vaultId: VAULT_ID,
          itemId: ITEM_ID,
          storageKey: "k",
          encryptedKey: Uint8Array.from([1]),
          size: 10,
          purpose: null,
          createdAt: "",
        };
      },
    } as AttachmentService["attachments"],
    vaults: {
      async canReadVault() {
        return true;
      },
      async findById() {
        return vaultRecord();
      },
    },
    workspaces: {
      async findById() {
        return workspaceRecord("FREE");
      },
    },
    events: { async hasReferencedItemId() { return true; } },
    softDeletes: { async exists() { return false; } },
    templates: { async findById() { return null; } },
    config: createTestApiConfig({ deploymentMode: "self_hosted", enterpriseModulesEnabled: false }),
    storageQuota: new WorkspaceStorageQuotaService({
      db: throwingDb(),
      config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: false },
    }),
    canUpdateWorkspaceBranding: async () => false,
  });
}

test("POST item write over the SaaS FREE 100 MiB ceiling returns 403 PLAN_QUOTA_EXCEEDED", async () => {
  const res = await dispatch({
    method: "POST",
    url: `/vaults/${VAULT_ID}/events`,
    headers: { "x-user-id": USER_ID },
    syncService: saasSyncService(100 * STORAGE_QUOTA_BYTES_PER_MIB),
    body: {
      eventType: "ITEM_UPDATE",
      encryptedBlob: mkBlob("too-big"),
      baseVersion: 1,
      referencedItemId: ITEM_ID,
    },
  });

  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body.toString()) as {
    error: string;
    message: string;
    details?: { limitMb?: number };
  };
  assert.equal(payload.error, "PLAN_QUOTA_EXCEEDED");
  assert.match(payload.message, /storage limit/i);
  assert.equal(payload.details?.limitMb, 100);
});

test("POST item delete is allowed when the workspace is already over the storage ceiling", async () => {
  const res = await dispatch({
    method: "POST",
    url: `/vaults/${VAULT_ID}/events`,
    headers: { "x-user-id": USER_ID },
    syncService: saasSyncService(100 * STORAGE_QUOTA_BYTES_PER_MIB),
    body: {
      eventType: "ITEM_DELETE",
      encryptedBlob: mkBlob("delete"),
      baseVersion: 2,
      referencedItemId: ITEM_ID,
      itemDeletedAtMs: Date.now(),
    },
  });

  assert.equal(res.statusCode, 201);
  const payload = JSON.parse(res.body.toString()) as { eventType: string };
  assert.equal(payload.eventType, "ITEM_DELETE");
});

test("self-hosted FREE large upload is not blocked by storage quota", async () => {
  const sizeBytes = 10 * 1024 * 1024;
  const res = await dispatch({
    method: "POST",
    url: `/vaults/${VAULT_ID}/items/${ITEM_ID}/attachments`,
    headers: {
      "x-user-id": USER_ID,
      "x-encrypted-key": Buffer.from([1, 2, 3]).toString("base64"),
      "x-file-name": encodeURIComponent("archive.bin"),
      "x-file-mime-type": "application/octet-stream",
      "x-file-size": String(sizeBytes),
    },
    body: Uint8Array.from([9, 9, 9, 9]),
    attachmentService: selfHostAttachmentService(),
  });

  assert.equal(res.statusCode, 201, res.body.toString());
  const payload = JSON.parse(res.body.toString()) as { sizeBytes: number };
  assert.equal(payload.sizeBytes, sizeBytes);
});

test("DELETE attachment is allowed when storage quota queries would fail", async () => {
  const res = await dispatch({
    method: "DELETE",
    url: `/vaults/${VAULT_ID}/items/${ITEM_ID}/attachments/${ATTACHMENT_ID}`,
    headers: { "x-user-id": USER_ID },
    attachmentService: selfHostAttachmentService(),
  });

  assert.equal(res.statusCode, 204);
});
