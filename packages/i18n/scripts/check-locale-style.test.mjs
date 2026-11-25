import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkKeyFormFieldLabelCasing,
  checkLinkGlueSpacing,
  runLocaleStyleCheck,
} from "./check-locale-style.mjs";

const scriptPath = fileURLToPath(new URL("./check-locale-style.mjs", import.meta.url));

test("BeforeLink / AfterLink glue keeps a space around the privacy link", () => {
  const errors = checkLinkGlueSpacing();
  assert.deepEqual(errors, []);
});

test("keyForm fieldLabels are lowercase in non-de locales except allow-listed abbreviations", () => {
  const errors = checkKeyFormFieldLabelCasing();
  assert.deepEqual(errors, []);
});

test("locale style CLI exits 0 on current tree", () => {
  const result = runLocaleStyleCheck();
  assert.equal(result.ok, true);
  const cli = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
});
