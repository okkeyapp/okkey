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

test("migration 0037 allowlists structural keys and documents vacuum/backup hygiene", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /COMMENT ON TABLE workspace_item_templates/i);
  assert.match(sql, /structure only/i);
  assert.match(sql, /UPDATE\s+workspace_item_templates/i);
  assert.match(sql, /jsonb_strip_nulls/);
  assert.match(sql, /jsonb_build_object\(/);
  assert.match(sql, /'id',\s*field->'id'/);
  assert.match(sql, /'type',\s*field->'type'/);
  assert.match(sql, /'label',\s*field->'label'/);
  assert.match(sql, /'value',\s*'""'::jsonb/);
  assert.match(sql, /'selectOptions',\s*field->'selectOptions'/);
  assert.doesNotMatch(sql, /field - 'copyValue'/);
  assert.match(sql, /VACUUM \(FULL\)/i);
  assert.match(sql, /backups/i);
  assert.match(sql, /empty forms/i);
});
