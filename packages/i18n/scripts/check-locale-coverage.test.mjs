import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCoverageCheck } from "./check-locale-coverage.mjs";

const scriptPath = fileURLToPath(new URL("./check-locale-coverage.mjs", import.meta.url));

test("coverage check reports per-locale percentages and ready gate", () => {
  const result = runCoverageCheck();
  assert.equal(result.threshold, 80);
  assert.ok(result.summary.en);
  assert.equal(result.summary.en.webCoveragePercent, 100);
  assert.ok(result.summary.en.ready);
  assert.ok(result.summary.ru.ready);
  for (const code of result.locales) {
    const row = result.summary[code];
    assert.ok(typeof row.webCoveragePercent === "number");
    assert.ok(typeof row.emailCoveragePercent === "number");
    if (row.ready) {
      assert.ok(row.webCoveragePercent >= 80);
      assert.ok(row.emailCoveragePercent >= 80);
      assert.equal(row.webErrors, 0);
      assert.equal(row.emailErrors, 0);
    }
  }
});

test("coverage CLI exits 0 on current locale tree", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.readyLocales.includes("en"));
  assert.ok(parsed.readyLocales.includes("ru"));
});
