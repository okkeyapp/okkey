import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("the bundle tool packs a core package and an enterprise package", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-bundle-tool-"));
  writeFileSync(
    path.join(dir, "core.okpkg"),
    JSON.stringify({ payload: { component: "okkey", version: "1.2.0" }, signature: "core" }),
  );
  writeFileSync(
    path.join(dir, "enterprise.okpkg"),
    JSON.stringify({ payload: { component: "enterprise", version: "2.0.0" }, signature: "enterprise" }),
  );
  const okbundle = path.join(dir, "release.okbundle");
  const zip = path.join(dir, "release.zip");
  const script = path.join(root, "scripts/build-offline-bundle.mjs");
  const packed = spawnSync(
    process.execPath,
    ["--experimental-strip-types", script, "--core", path.join(dir, "core.okpkg"), "--enterprise", path.join(dir, "enterprise.okpkg"), "--out", okbundle],
    { encoding: "utf8" },
  );
  assert.equal(packed.status, 0, packed.stderr);
  const document = JSON.parse(readFileSync(okbundle, "utf8"));
  assert.equal(document.format, "okkey-offline-bundle");
  assert.equal(document.formatVersion, 1);
  assert.equal(Buffer.from(document.archiveBase64, "base64").subarray(0, 2).toString("utf8"), "PK");

  const zipped = spawnSync(
    process.execPath,
    ["--experimental-strip-types", script, "--core", path.join(dir, "core.okpkg"), "--enterprise", path.join(dir, "enterprise.okpkg"), "--out", zip],
    { encoding: "utf8" },
  );
  assert.equal(zipped.status, 0, zipped.stderr);
  assert.equal(readFileSync(zip).subarray(0, 2).toString("utf8"), "PK");
  assert.equal(readFileSync(zip).equals(Buffer.from(document.archiveBase64, "base64")), true);
});

test("release publish packs an archive only when an enterprise package is supplied", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/publish-images.yml"), "utf8");
  assert.match(workflow, /enterprise_package_path/);
  assert.match(workflow, /core_package_path/);
  assert.match(workflow, /scripts\/build-offline-bundle\.mjs/);
  assert.match(workflow, /github\.event\.inputs\.enterprise_package_path != ''/);
  assert.equal(workflow.includes("needs: offline-bundle"), false);
  const action = readFileSync(path.join(root, ".github/actions/build-offline-bundle/action.yml"), "utf8");
  assert.match(action, /core_package/);
  assert.match(action, /enterprise_package/);
  assert.match(action, /build-offline-bundle\.mjs/);
  const reusable = readFileSync(path.join(root, ".github/workflows/build-offline-bundle.yml"), "utf8");
  assert.match(reusable, /workflow_call/);
  assert.match(reusable, /build-offline-bundle\.mjs/);
});
