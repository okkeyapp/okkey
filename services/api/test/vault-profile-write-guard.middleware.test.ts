import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";

import { HttpApp, json } from "../src/http.ts";
import { createSimpleProfilePermissions } from "@okkey/types";

import { createVaultProfileWriteGuardMiddleware } from "../src/vault-profile-write-guard/middleware.ts";
import { VaultProfileWriteGuardService } from "../src/vault-profile-write-guard/service.ts";
import type { VaultProfileWriteGuardRepository } from "../src/vault-profile-write-guard/repository.ts";

function mockReq(options: {
  method: string;
  url: string;
  body?: unknown;
  userId?: string | null;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  req.method = options.method;
  req.url = options.url;
  req.headers = {};
  if (options.body !== undefined) {
    req.body = options.body;
  }
  return req;
}

function mockRes(): ServerResponse & {
  statusCode: number;
  body: string;
  writableEnded: boolean;
} {
  const res = {
    statusCode: 200,
    body: "",
    writableEnded: false,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(chunk?: string) {
      this.writableEnded = true;
      if (chunk) {
        this.body = chunk;
      }
    },
  };
  return res as unknown as ServerResponse & {
    statusCode: number;
    body: string;
    writableEnded: boolean;
  };
}

test("middleware returns 403 PROFILE_PERMISSION_DENIED for Simple ITEM_CREATE", async () => {
  const repo: VaultProfileWriteGuardRepository = {
    findVaultProfile: async () => ({
      vaultId: "1000000000000000001",
      workspaceId: "ws-1",
      isPersonal: false,
      permissionsJson: createSimpleProfilePermissions(),
      hasProfileAssignment: true,
    }),
    findItemCreatorUserId: async () => null,
  };
  const service = new VaultProfileWriteGuardService(repo, {
    canManageVaultSettings: async () => false,
    canReadVault: async () => true,
  });

  const app = new HttpApp();
  app.use(
    createVaultProfileWriteGuardMiddleware(service, async () => "ro-user"),
  );
  let handlerReached = false;
  app.route("POST", "/vaults/:vaultId/events", async (ctx) => {
    handlerReached = true;
    json(ctx.res, 201, { ok: true });
  });

  const req = mockReq({
    method: "POST",
    url: "/vaults/1000000000000000001/events",
    body: {
      eventType: "ITEM_CREATE",
      encryptedBlob: { crypto_version: 2, payload: "x" },
      baseVersion: 0,
      referencedItemId: "1000000000000000002",
      idempotencyKey: "1000000000000000003",
    },
  });
  const res = mockRes();
  await app.handler()(req, res);

  assert.equal(handlerReached, false);
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "PROFILE_PERMISSION_DENIED");
});

test("middleware allows personal vault sync append through to handler", async () => {
  const repo: VaultProfileWriteGuardRepository = {
    findVaultProfile: async () => ({
      vaultId: "1000000000000000001",
      workspaceId: "ws-1",
      isPersonal: true,
      permissionsJson: createSimpleProfilePermissions(),
      hasProfileAssignment: true,
    }),
    findItemCreatorUserId: async () => null,
  };
  const service = new VaultProfileWriteGuardService(repo, {
    canManageVaultSettings: async () => false,
    canReadVault: async () => true,
  });

  const app = new HttpApp();
  app.use(
    createVaultProfileWriteGuardMiddleware(service, async () => "ro-user"),
  );
  let handlerReached = false;
  app.route("POST", "/vaults/:vaultId/events", async (ctx) => {
    handlerReached = true;
    json(ctx.res, 201, { ok: true });
  });

  const req = mockReq({
    method: "POST",
    url: "/vaults/1000000000000000001/events",
    body: {
      eventType: "ITEM_CREATE",
      encryptedBlob: { crypto_version: 2, payload: "x" },
      baseVersion: 0,
      referencedItemId: "1000000000000000002",
    },
  });
  const res = mockRes();
  await app.handler()(req, res);

  assert.equal(handlerReached, true);
  assert.equal(res.statusCode, 201);
});
