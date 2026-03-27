import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createApiApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { VaultService } from "../src/vault/service.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

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

test("integration: HTTP GET workspace vaults and vault by id return cryptoVersion from DB", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `vault-http-crypto-${suffix}@okkey.local`;

  const vaultService = new VaultService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);

  const wsRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = wsRows[0]?.id;
  assert.ok(workspaceId);

  const vaultRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM vaults WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1",
    [workspaceId],
  );
  const vaultId = vaultRows[0]?.id;
  assert.ok(vaultId);

  const app = createApiApp(config, createLoggerStub(), { vaultService });
  const handler = app.handler();

  const resList = new MockResponse();
  await handler(
    {
      method: "GET",
      url: `/workspaces/${workspaceId}/vaults`,
      headers: { "x-user-id": userId },
    } as IncomingMessage,
    resList as unknown as ServerResponse,
  );

  assert.equal(resList.statusCode, 200);
  const list = JSON.parse(resList.body) as Array<{
    id: string;
    cryptoVersion: number;
    workspaceId: string;
  }>;
  assert.ok(list.length >= 1);
  for (const row of list) {
    assert.equal(
      row.cryptoVersion,
      2,
      `list: vault ${row.id} must include cryptoVersion 2 (new vault baseline)`,
    );
    assert.equal(row.workspaceId, workspaceId);
  }

  const resOne = new MockResponse();
  await handler(
    {
      method: "GET",
      url: `/vaults/${vaultId}`,
      headers: { "x-user-id": userId },
    } as IncomingMessage,
    resOne as unknown as ServerResponse,
  );

  assert.equal(resOne.statusCode, 200);
  const one = JSON.parse(resOne.body) as {
    id: string;
    cryptoVersion: number;
    workspaceId: string;
  };
  assert.equal(one.id, vaultId);
  assert.equal(one.cryptoVersion, 2);
  assert.equal(one.workspaceId, workspaceId);
});
