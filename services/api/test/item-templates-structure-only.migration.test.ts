import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration0037Path = path.resolve(
  __dirname,
  "../migrations/0037_item_templates_structure_only.sql",
);
const migration0038Path = path.resolve(
  __dirname,
  "../migrations/0038_item_templates_structure_allowlist.sql",
);

test("migration 0037 clears field values without allowlist rebuild", () => {
  const sql = readFileSync(migration0037Path, "utf8");

  assert.match(sql, /COMMENT ON TABLE workspace_item_templates/i);
  assert.match(sql, /structure only/i);
  assert.match(sql, /UPDATE\s+workspace_item_templates/i);
  assert.match(sql, /\{record_name\}/);
  assert.match(sql, /\{tags\}/);
  assert.match(sql, /\{sections\}/);
  assert.match(sql, /field - 'copyValue'/);
  assert.match(sql, /jsonb_build_object\('value', ''\)/);
  assert.doesNotMatch(sql, /jsonb_strip_nulls/);
});

test("migration 0038 allowlists structural keys with typed values and documents vacuum/WAL hygiene", () => {
  const sql = readFileSync(migration0038Path, "utf8");

  assert.match(sql, /UPDATE\s+workspace_item_templates/i);
  assert.match(sql, /jsonb_strip_nulls/);
  assert.match(sql, /jsonb_typeof\(field->'id'\) = 'string'/);
  assert.match(sql, /jsonb_typeof\(field->'editableLabel'\) = 'boolean'/);
  assert.match(sql, /secretKind' IN \('password', 'single-line', 'multi-line'\)/);
  assert.match(sql, /urlAutofillScope' IN \('entire-site', 'exact-url', 'none'\)/);
  assert.match(sql, /'value',\s*'""'::jsonb/);
  assert.match(sql, /VACUUM \(FULL\)/i);
  assert.match(sql, /exclusive lock/i);
  assert.match(sql, /pg_wal/i);
  assert.match(sql, /PITR/i);
  assert.match(sql, /replicas/i);
  assert.match(sql, /snapshots/i);
  assert.match(sql, /empty forms/i);
});
