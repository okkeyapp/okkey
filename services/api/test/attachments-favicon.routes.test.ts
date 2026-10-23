import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import { AttachmentService, AttachmentServiceError } from "../src/attachments/service.ts";
import { createApiApp } from "../src/app.ts";
import type { KeyFieldFileStorage } from "../src/storage/key-field-file-storage.ts";
import type { AttachmentsRepository } from "../src/storage/attachments.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = Buffer.alloc(0);
  private readonly headers = new Map<string, string>();
  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }
  end(chunk?: string | Buffer): void {
    if (chunk) {
      const next = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.body = Buffer.concat([this.body, next]);
    }
    this.writableEnded = true;
  }
}

const VAULT_ID = "1000000000000000001";
const ITEM_ID = "1000000000000000002";
const USER_ID = "1000000000000000009";

function faviconService() {
  const storage = {
    async upload(params: { fileName: string }) {
      return {
        attachmentId: "1000000000000000003",
        storageKey: "attachments/favicon",
        name: params.fileName,
        mimeType: "image/png",
        sizeBytes: 4,
      };
    },
    async deleteByStorageKey() {},
  } as unknown as KeyFieldFileStorage;
  const attachments = {
    async create() {
      throw new Error("favicon uses replaceItemFavicon");
    },
    async replaceItemFavicon(record: { id: string; vaultId: string; itemId: string; storageKey: string }) {
      return {
        record: {
          id: record.id,
          vaultId: record.vaultId,
          itemId: record.itemId,
          storageKey: record.storageKey,
          encryptedKey: Uint8Array.from([1]),
          size: 4,
          purpose: "item-favicon",
          createdAt: "",
        },
        replaced: [],
      };
    },
  } as unknown as AttachmentsRepository;
  return new AttachmentService({
    storage,
    attachments,
    vaults: {
      async canReadVault() {
        return true;
      },
      async findById() {
        return { id: VAULT_ID, workspaceId: "1000000000000000010" };
      },
    } as never,
    workspaces: {
      async findById() {
        return {
          id: "1000000000000000010",
          planTier: "FREE",
          planCustomOverride: false,
          planFeatureOverrides: {},
          filesInItemsEnabled: false,
          maxFileSizeMb: 1,
          allowedFileExtensions: [],
        };
      },
    } as never,
    events: { async hasReferencedItemId() { return true; } } as never,
    softDeletes: { async exists() { return false; } } as never,
    templates: { async findById() { return null; } } as never,
    config: createTestApiConfig({ deploymentMode: "saas" }),
  });
}

async function upload(purpose: string | undefined) {
  const app = createApiApp(createTestApiConfig({ allowHeaderUserIdAuth: false }), {
    info() {},
    warn() {},
    error() {},
  }, {
    attachmentService: faviconService(),
    sessionService: {
      async resolveAccessToken(token: string) {
        return token === "good" ? { userId: USER_ID } : null;
      },
    } as unknown as SessionService,
  });
  const headers: Record<string, string> = {
    authorization: "Bearer good",
    "x-encrypted-key": Buffer.from([1, 2, 3]).toString("base64"),
    "x-file-name": "favicon.png",
    "x-file-mime-type": "image/png",
  };
  if (purpose) headers["x-attachment-purpose"] = purpose;
  const req = {
    method: "POST",
    url: `/vaults/${VAULT_ID}/items/${ITEM_ID}/attachments`,
    headers,
    body: Uint8Array.from([1, 2, 3, 4]),
  } as IncomingMessage & { body?: Uint8Array };
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("item favicon upload is allowed when files in items are disabled (QA favicon, any plan)", async () => {
  const favicon = await upload("item-favicon");
  assert.equal(favicon.statusCode, 201);
  const payload = JSON.parse(favicon.body.toString()) as { error?: string };
  assert.notEqual(payload.error, "FILES_IN_ITEMS_DISABLED");

  const regular = await upload(undefined);
  assert.equal(regular.statusCode, 403);
  assert.equal(JSON.parse(regular.body.toString()).error, "FILES_IN_ITEMS_DISABLED");
  assert.equal(new AttachmentServiceError("FILES_IN_ITEMS_DISABLED", 403, "x").code, "FILES_IN_ITEMS_DISABLED");
});
