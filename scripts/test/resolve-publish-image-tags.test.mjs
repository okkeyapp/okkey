import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertBeta2TagSet,
  resolveImageVersion,
  tagsForImage,
} from "../resolve-publish-image-tags.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = join(root, "scripts", "resolve-publish-image-tags.mjs");
const IMAGE = "ghcr.io/okkeyapp/api";

test("v1.0.0-beta.2 → only :1.0.0-beta.2 (no :latest / :1 / :1.0)", () => {
  const tags = tagsForImage(IMAGE, {
    eventName: "push",
    refType: "tag",
    refName: "v1.0.0-beta.2",
    ref: "refs/tags/v1.0.0-beta.2",
    sha: "abc1234567890",
  });
  assert.deepEqual(tags, [`${IMAGE}:1.0.0-beta.2`]);
  assertBeta2TagSet(tags, IMAGE);
  assert.equal(
    resolveImageVersion({
      eventName: "push",
      refType: "tag",
      refName: "v1.0.0-beta.2",
    }),
    "1.0.0-beta.2",
  );
});

test("assertBeta2TagSet rejects rolling and :latest", () => {
  assert.throws(
    () => assertBeta2TagSet([`${IMAGE}:1.0.0-beta.2`, `${IMAGE}:1.0`], IMAGE),
    /forbidden tag|must publish only/,
  );
  assert.throws(
    () => assertBeta2TagSet([`${IMAGE}:1.0.0-beta.2`, `${IMAGE}:latest`], IMAGE),
    /forbidden tag|must publish only/,
  );
  assert.throws(
    () => assertBeta2TagSet([`${IMAGE}:1.0.0-beta.2`, `${IMAGE}:1`], IMAGE),
    /forbidden tag|must publish only/,
  );
});

test("clean SemVer gets rolling :X.Y / :X but never auto :latest", () => {
  const tags = tagsForImage(IMAGE, {
    eventName: "push",
    refType: "tag",
    refName: "v1.2.3",
    ref: "refs/tags/v1.2.3",
  });
  assert.deepEqual(tags, [
    `${IMAGE}:1.2.3`,
    `${IMAGE}:1.2`,
    `${IMAGE}:1`,
  ]);
  assert.ok(!tags.includes(`${IMAGE}:latest`));
});

test("dev push → :dev + :dev-<sha7>", () => {
  const tags = tagsForImage(IMAGE, {
    eventName: "push",
    ref: "refs/heads/dev",
    sha: "deadbeefcafebabe",
  });
  assert.deepEqual(tags, [`${IMAGE}:dev`, `${IMAGE}:dev-deadbee`]);
});

test("workflow_dispatch :latest only when push_latest=true", () => {
  const base = tagsForImage(IMAGE, {
    eventName: "workflow_dispatch",
    dispatchTag: "1.0.0-beta.2",
    dispatchLatest: false,
  });
  assert.deepEqual(base, [`${IMAGE}:1.0.0-beta.2`]);

  const withLatest = tagsForImage(IMAGE, {
    eventName: "workflow_dispatch",
    dispatchTag: "1.0.0-beta.2",
    dispatchLatest: "true",
  });
  assert.deepEqual(withLatest, [
    `${IMAGE}:1.0.0-beta.2`,
    `${IMAGE}:latest`,
  ]);
});

test("CLI writes GITHUB_OUTPUT for v1.0.0-beta.2", () => {
  const dir = mkdtempSync(join(tmpdir(), "okkey-img2-tags-"));
  const out = join(dir, "github_output");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVENT_NAME: "push",
      REF: "refs/tags/v1.0.0-beta.2",
      REF_TYPE: "tag",
      REF_NAME: "v1.0.0-beta.2",
      SHA: "0123456789abcdef",
      GITHUB_OUTPUT: out,
      REGISTRY: "ghcr.io",
      OWNER: "okkeyapp",
    },
  });
  const output = readFileSync(out, "utf8");
  rmSync(dir, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(output, /tags_api=ghcr\.io\/okkeyapp\/api:1\.0\.0-beta\.2\n/);
  assert.match(output, /image_version=1\.0\.0-beta\.2\n/);
  assert.doesNotMatch(output, /api:latest|api:1\.0,|api:1\n/);
  assert.match(result.stdout, /api tags: ghcr\.io\/okkeyapp\/api:1\.0\.0-beta\.2/);
});
