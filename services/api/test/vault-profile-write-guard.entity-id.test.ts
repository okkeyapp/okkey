import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";

import { HttpApp, json } from "../src/http.ts";

import { createVaultProfileWriteGuardMiddleware } from "../src/vault-profile-write-guard/middleware.ts";
import { VaultProfileWriteGuardService } from "../src/vault-profile-write-guard/service.ts";
import type { VaultProfileWriteGuardRepository } from "../src/vault-profile-write-guard/repository.ts";

const VALID = "374901234567890123";

/** Values that must be 400 before Postgres, matching the QA matrix for issue #167. */
const MALFORMED_IDS = [
  "abc",
  "1".repeat(23),
  " ",
  "１２３４５６７８９０",
  "снежинка",
  "a".repeat(300),
  "a".repeat(5000),
  "9223372036854775808",
  "18446744073709551615",
  "1.5",
  "1e5",
  "550e8400-e29b-41d4-a716-446655440000",
  "\0",
  "/",
  "%00",
  "%2F",
  "null",
];

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  req.method = method;
  req.url = url;
  req.headers = {};
  if (body !== undefined) {
    req.body = body;
  }
  return req;
}

function mockRes(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 200,
    body: "",
    writableEnded: false,
    setHeader() {},
    end(chunk?: string) {
      this.writableEnded = true;
      if (chunk) {
        this.body = chunk;
      }
    },
  };
  return res as unknown as ServerResponse & { statusCode: number; body: string };
}

function guardApp(userId: string | null): {
  app: HttpApp;
  hits: { queries: number; handler: boolean };
} {
  const hits = { queries: 0, handler: false };
  const repo: VaultProfileWriteGuardRepository = {
    findVaultProfile: async () => {
      hits.queries += 1;
      return null;
    },
    findItemCreatorUserId: async () => {
      hits.queries += 1;
      throw new Error("postgres query failed");
    },
  };
  const service = new VaultProfileWriteGuardService(repo, {
    canManageVaultSettings: async () => false,
    canReadVault: async () => true,
  });
  const app = new HttpApp();
  app.use(createVaultProfileWriteGuardMiddleware(service, async () => userId));
  const touch = async (ctx: { res: ServerResponse }) => {
    hits.handler = true;
    json(ctx.res, 204, {});
  };
  app.route("POST", "/vaults/:vaultId/items/:itemId/attachments", touch);
  app.route("GET", "/vaults/:vaultId/items/:itemId/attachments/:attachmentId", touch);
  app.route("DELETE", "/vaults/:vaultId/items/:itemId/attachments/:attachmentId", touch);
  app.route("POST", "/vaults/:vaultId/events", touch);
  return { app, hits };
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

async function dispatch(
  app: HttpApp,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ statusCode: number; error?: string; message?: string }> {
  const res = mockRes();
  await app.handler()(mockReq(method, url, body), res);
  const payload = res.body ? (JSON.parse(res.body) as { error?: string; message?: string }) : {};
  return { statusCode: res.statusCode, error: payload.error, message: payload.message };
}

test("attachment routes reject malformed vaultId and itemId before Postgres", async () => {
  const cases: Array<{ method: "POST" | "GET" | "DELETE"; url: (vaultId: string, itemId: string) => string }> = [
    {
      method: "POST",
      url: (vaultId, itemId) => `/vaults/${segment(vaultId)}/items/${segment(itemId)}/attachments`,
    },
    {
      method: "GET",
      url: (vaultId, itemId) =>
        `/vaults/${segment(vaultId)}/items/${segment(itemId)}/attachments/${VALID}`,
    },
    {
      method: "DELETE",
      url: (vaultId, itemId) =>
        `/vaults/${segment(vaultId)}/items/${segment(itemId)}/attachments/${VALID}`,
    },
  ];

  for (const malformed of MALFORMED_IDS) {
    for (const route of cases) {
      for (const field of ["vaultId", "itemId"] as const) {
        const { app, hits } = guardApp("user-1");
        const vaultId = field === "vaultId" ? malformed : VALID;
        const itemId = field === "itemId" ? malformed : VALID;
        const result = await dispatch(app, route.method, route.url(vaultId, itemId));
        assert.equal(result.statusCode, 400, `${route.method} ${field}=${JSON.stringify(malformed)}`);
        assert.equal(
          result.error,
          field === "vaultId" ? "INVALID_VAULT_ID" : "INVALID_ITEM_ID",
        );
        assert.equal(result.message, `${field} must be a snowflake entity id`);
        assert.equal(hits.queries, 0);
        assert.equal(hits.handler, false);
      }
    }
  }
});

test("attachment guard lets a valid vault and item id through", async () => {
  const { app, hits } = guardApp("user-1");
  const result = await dispatch(
    app,
    "DELETE",
    `/vaults/${VALID}/items/${VALID}/attachments/${VALID}`,
  );
  assert.equal(result.statusCode, 204);
  assert.equal(hits.handler, true);
  assert.equal(hits.queries, 1);
});

test("unauthenticated malformed attachment id is 400 before auth", async () => {
  const { app, hits } = guardApp(null);
  const result = await dispatch(app, "POST", `/vaults/${segment("abc")}/items/${VALID}/attachments`);
  assert.equal(result.statusCode, 400);
  assert.equal(result.error, "INVALID_VAULT_ID");
  assert.equal(hits.queries, 0);
  assert.equal(hits.handler, false);
});

test("sync append rejects a malformed vaultId before Postgres", async () => {
  for (const malformed of MALFORMED_IDS) {
    const { app, hits } = guardApp("user-1");
    const result = await dispatch(app, "POST", `/vaults/${segment(malformed)}/events`, {
      eventType: "ITEM_CREATE",
      referencedItemId: VALID,
    });
    assert.equal(result.statusCode, 400, JSON.stringify(malformed));
    assert.equal(result.error, "INVALID_VAULT_ID");
    assert.equal(hits.queries, 0);
    assert.equal(hits.handler, false);
  }
});
