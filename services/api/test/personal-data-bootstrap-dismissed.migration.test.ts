import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../migrations/0035_personal_data_bootstrap_dismissed.sql",
);

test("migration 0035 backfills existing members as personal_data bootstrap dismissed", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS personal_data_bootstrap_dismissed boolean NOT NULL DEFAULT false/,
  );
  // New preference rows after migration still default to false (genuinely new accounts).
  assert.match(sql, /DEFAULT false/);

  // Existing preference rows are marked dismissed.
  assert.match(
    sql,
    /UPDATE\s+workspace_member_item_category_preferences\s+SET\s+personal_data_bootstrap_dismissed\s*=\s*true/i,
  );

  // Existing members without a preferences row get an inserted dismissed=true row.
  assert.match(sql, /INSERT INTO workspace_member_item_category_preferences/i);
  assert.match(sql, /FROM workspace_members wm/i);
  assert.match(sql, /personal_data_bootstrap_dismissed/i);
  assert.match(sql, /true\s*\nFROM workspace_members wm/i);
});
