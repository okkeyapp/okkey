import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../migrations/0037_item_templates_structure_only.sql",
);

test("migration 0037 clears stored template field values and documents structure-only storage", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /COMMENT ON TABLE workspace_item_templates/i);
  assert.match(sql, /structure only/i);
  assert.match(sql, /UPDATE\s+workspace_item_templates/i);
  assert.match(sql, /\{record_name\}/);
  assert.match(sql, /\{tags\}/);
  assert.match(sql, /\{sections\}/);
  assert.match(sql, /field - 'copyValue'/);
  assert.match(sql, /jsonb_build_object\('value', ''\)/);
});
