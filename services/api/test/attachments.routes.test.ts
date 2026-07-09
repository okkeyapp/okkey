import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import type { AttachmentService } from "../src/attachments/service.ts";
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

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

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

function createSessionServiceStub(): SessionService {
  return {
    async resolveAccessToken(token: string) {
      return token.trim() === "test-access-token" ? { userId: "1000000000000000009" } : null;
    },
  } as unknown as SessionService;
}

function createAttachmentServiceStub(overrides?: Partial<AttachmentService>): AttachmentService {
  return {
    upload: async () => ({
      attachmentId: "1000000000000000003",
      name: "secret.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123,
    }),
    download: async () => ({
      record: {
        id: "1000000000000000003",
        vaultId: "1000000000000000001",
        itemId: "1000000000000000002",
        storageKey: "attachments/1000000000000000001/1000000000000000003",
        encryptedKey: Uint8Array.from([1, 2, 3]),
        size: 123,
        createdAt: "",
      },
      encryptedBody: Uint8Array.from([4, 5, 6]),
      name: "secret.pdf",
      mimeType: "application/pdf",
    }),
    delete: async () => undefined,
    ...(overrides ?? {}),
  } as unknown as AttachmentService;
}

const config: ApiConfig = createTestApiConfig();

async function dispatch(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
  attachmentService?: AttachmentService;
}) {
  const app = createApiApp(config, loggerStub(), {
    attachmentService: input.attachmentService ?? createAttachmentServiceStub(),
    sessionService: createSessionServiceStub(),
  });
  const req = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    body: input.body,
  } as IncomingMessage & { body?: Uint8Array };
  const res = new MockResponse();

  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("POST /vaults/:vaultId/items/:itemId/attachments requires auth", async () => {
  const res = await dispatch({
    method: "POST",
    url: "/vaults/1000000000000000001/items/1000000000000000002/attachments",
    headers: {
      "x-encrypted-key": Buffer.from([1, 2, 3]).toString("base64"),
      "x-file-name": "secret.pdf",
    },
    body: Uint8Array.from([4, 5, 6]),
  });

  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body.toString()).error, "AUTH_REQUIRED");
});

test("POST /vaults/:vaultId/items/:itemId/attachments uploads encrypted body", async () => {
  let seenUserId = "";
  let seenBody = new Uint8Array();
  const res = await dispatch({
    method: "POST",
    url: "/vaults/1000000000000000001/items/1000000000000000002/attachments",
    headers: {
      authorization: "Bearer test-access-token",
      "x-encrypted-key": Buffer.from([1, 2, 3]).toString("base64"),
      "x-file-name": encodeURIComponent("secret.pdf"),
      "x-file-mime-type": "application/pdf",
      "x-file-size": "123",
    },
    body: Uint8Array.from([4, 5, 6]),
    attachmentService: createAttachmentServiceStub({
      upload: async (input) => {
        seenUserId = input.userId;
        seenBody = input.encryptedBody;
        return {
          attachmentId: "1000000000000000003",
          name: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
        };
      },
    }),
  });

  assert.equal(res.statusCode, 201);
  assert.equal(seenUserId, "1000000000000000009");
  assert.deepEqual(seenBody, Uint8Array.from([4, 5, 6]));
  assert.equal(JSON.parse(res.body.toString()).attachmentId, "1000000000000000003");
});

test("GET /vaults/:vaultId/items/:itemId/attachments/:attachmentId returns encrypted bytes", async () => {
  const res = await dispatch({
    method: "GET",
    url: "/vaults/1000000000000000001/items/1000000000000000002/attachments/1000000000000000003",
    headers: { authorization: "Bearer test-access-token" },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, Buffer.from([4, 5, 6]));
  assert.equal(res.getHeader("x-encrypted-key"), Buffer.from([1, 2, 3]).toString("base64"));
  assert.equal(res.getHeader("x-file-mime-type"), "application/pdf");
});

test("DELETE /vaults/:vaultId/items/:itemId/attachments/:attachmentId returns 204", async () => {
  let deleted = false;
  const res = await dispatch({
    method: "DELETE",
    url: "/vaults/1000000000000000001/items/1000000000000000002/attachments/1000000000000000003",
    headers: { authorization: "Bearer test-access-token" },
    attachmentService: createAttachmentServiceStub({
      delete: async () => {
        deleted = true;
      },
    }),
  });

  assert.equal(res.statusCode, 204);
  assert.equal(deleted, true);
});
