import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  derivePersonalWorkspaceMetadataKey,
  encryptPersonalVaultMetadataPayload,
  initCrypto,
  registerWasmModulePath,
  ensureWasm,
  wipeBytes,
} from "../dist/index.js";
import { createWorkspaceFoldersSyncController } from "../../vault/dist/folders/workspaceFoldersSync.js";
import { bytesToBase64 } from "../../vault/dist/base64.js";

const here = dirname(fileURLToPath(import.meta.url));
const wasmBytes = readFileSync(join(here, "../dist/okkey_crypto_engine_bg.wasm"));

function folderPlaintextBytes(folder) {
  return new TextEncoder().encode(JSON.stringify(folder));
}

test("folder sync decrypts after concurrent path-less ensureWasm race", async () => {
  const passwordShareC = new Uint8Array(32);
  passwordShareC.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  // Entity IDs must match snowflake shape (isEntityId).
  const workspaceId = "328972412198588416";
  const userId = "328972412177616896";
  const folderId = "341205948123456789";

  // Extension race: register preferred path (module load), then concurrent ensureWasm + init.
  registerWasmModulePath({ module_or_path: wasmBytes });
  await Promise.all([ensureWasm(), initCrypto({ module_or_path: wasmBytes })]);

  const key = await derivePersonalWorkspaceMetadataKey(passwordShareC, workspaceId);
  const folder = {
    schemaVersion: 2,
    folderId,
    workspaceId,
    name: "Работа",
    parentFolderId: null,
    sortOrder: 0,
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const blob = await encryptPersonalVaultMetadataPayload(key, folderPlaintextBytes(folder));
  const payload = bytesToBase64(blob);

  const events = [
    {
      id: "329227804497416192",
      workspaceId,
      actorId: userId,
      eventType: "FOLDER_CREATE",
      encryptedBlob: { crypto_version: 2, algorithm: "opaque", payload },
      idempotencyKey: "329227804228980736",
      clientCreatedAt: null,
      version: 1,
      createdAt: new Date().toISOString(),
    },
  ];

  let listCalls = 0;
  const core = {
    listWorkspacePersonalEvents: async (_ws, afterVersion) => {
      listCalls += 1;
      if (afterVersion === 0) {
        return { events };
      }
      return { events: [] };
    },
    appendWorkspacePersonalEvent: async () => {
      throw new Error("not used");
    },
  };

  const controller = createWorkspaceFoldersSyncController({
    core,
    userId,
    workspaceId,
    passwordShareC,
  });

  // Second race during refresh decrypt path
  await Promise.all([ensureWasm(), controller.refresh()]);

  const tree = controller.toFolderTree();
  const diag = controller.getLastRefreshDiagnostics();
  assert.ok(tree.length > 0, `expected folders, got ${tree.length} (listCalls=${listCalls})`);
  assert.equal(tree[0]?.label, "Работа");
  assert.ok(diag);
  assert.equal(diag.folderCount, 1);
  assert.ok(diag.decryptAttempts >= 1);
  assert.equal(diag.decryptFailures, 0);

  console.log(
    JSON.stringify({
      evidence: "folderCount>0",
      folderCount: tree.length,
      label: tree[0]?.label,
      diagnostics: diag,
    }),
  );

  wipeBytes(passwordShareC);
  wipeBytes(key);
  controller.dispose();
});
