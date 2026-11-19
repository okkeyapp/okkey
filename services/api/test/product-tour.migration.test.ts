import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, "../migrations/0061_product_tour.sql");

test("migration 0061 adds product tour columns and backfills existing users", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS product_tour_completed boolean NOT NULL DEFAULT false/,
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS product_tour_step smallint NOT NULL DEFAULT 1/);
  assert.match(sql, /UPDATE\s+users\s+SET\s+product_tour_completed\s*=\s*true/i);
});
