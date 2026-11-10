import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_LOGO_CIPHERTEXT_BYTES_SQL,
  readWorkspaceLogoCiphertextBytes,
  workspaceLogoQuotaDelta,
} from "../src/storage-quota/workspace-logo-bytes.ts";

test("workspace logo quota counts the current ciphertext and replace is not additive", () => {
  const created = workspaceLogoQuotaDelta(0, 1200);
  assert.equal(created.usageBytes, 1200);
  assert.equal(created.additionalBytes, 1200);
  assert.equal(created.replacedBytes, 0);

  const replaced = workspaceLogoQuotaDelta(1200, 800);
  assert.equal(replaced.usageBytes, 800);
  assert.equal(replaced.additionalBytes, 800);
  assert.equal(replaced.replacedBytes, 1200);
  assert.equal(replaced.usageBytes, replaced.additionalBytes - replaced.replacedBytes + 1200);

  const deleted = workspaceLogoQuotaDelta(800, 0);
  assert.equal(deleted.usageBytes, 0);
  assert.equal(deleted.replacedBytes, 800);
  assert.equal(deleted.additionalBytes, 0);
});

test("logo ciphertext accessor reads workspace_logos.ciphertext_bytes", async () => {
  let seenSql = "";
  const bytes = await readWorkspaceLogoCiphertextBytes(
    {
      async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        seenSql = sql;
        assert.deepEqual(params, ["1000000000000000001"]);
        return [{ bytes: 4096 }] as T[];
      },
    },
    "1000000000000000001",
  );
  assert.equal(bytes, 4096);
  assert.match(seenSql, /workspace_logos/);
  assert.match(seenSql, /ciphertext_bytes/);
  assert.equal(seenSql.includes(WORKSPACE_LOGO_CIPHERTEXT_BYTES_SQL), true);
});
