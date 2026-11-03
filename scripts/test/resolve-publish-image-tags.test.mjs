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

test("dev push does not publish :dev (manual dispatch only)", () => {
  assert.throws(
    () =>
      tagsForImage(IMAGE, {
        eventName: "push",
        ref: "refs/heads/dev",
        refName: "dev",
        sha: "deadbeefcafebabe",
      }),
    /workflow_dispatch/,
  );
  assert.throws(
    () =>
      resolveImageVersion({
        eventName: "push",
        ref: "refs/heads/dev",
        refName: "dev",
      }),
    /workflow_dispatch/,
  );
});

test("release branch → candidate + sha, never :latest or the final pin", () => {
  const tags = tagsForImage(IMAGE, {
    eventName: "push",
    ref: "refs/heads/release/1.0.0-beta.2",
    refType: "branch",
    refName: "release/1.0.0-beta.2",
    sha: "deadbeefcafebabe",
  });
  assert.deepEqual(tags, [
    `${IMAGE}:1.0.0-beta.2-candidate`,
    `${IMAGE}:1.0.0-beta.2-deadbee`,
  ]);
  for (const forbidden of [
    `${IMAGE}:latest`,
    `${IMAGE}:1`,
    `${IMAGE}:1.0`,
    `${IMAGE}:1.0.0`,
    `${IMAGE}:1.0.0-beta.2`,
    `${IMAGE}:dev`,
  ]) {
    assert.ok(!tags.includes(forbidden), forbidden);
  }
  assert.equal(
    resolveImageVersion({
      eventName: "push",
      ref: "refs/heads/release/1.0.0-beta.2",
      refType: "branch",
      refName: "release/1.0.0-beta.2",
      sha: "deadbeefcafebabe",
    }),
    "1.0.0-beta.2-candidate",
  );
});

test("hotfix branch → candidate + sha, no rolling majors", () => {
  const tags = tagsForImage(IMAGE, {
    eventName: "push",
    ref: "refs/heads/hotfix/1.2.3",
    refType: "branch",
    refName: "hotfix/1.2.3",
    sha: "abc1234567890",
  });
  assert.deepEqual(tags, [
    `${IMAGE}:1.2.3-candidate`,
    `${IMAGE}:1.2.3-abc1234`,
  ]);
  assert.ok(!tags.includes(`${IMAGE}:latest`));
  assert.ok(!tags.includes(`${IMAGE}:1.2`));
  assert.ok(!tags.includes(`${IMAGE}:1`));
  assert.ok(!tags.includes(`${IMAGE}:1.2.3`));
});

test("release/v<semver> strips the leading v", () => {
  const tags = tagsForImage(IMAGE, {
    eventName: "push",
    ref: "refs/heads/release/v1.0.0-beta.2",
    refName: "release/v1.0.0-beta.2",
    sha: "deadbeefcafebabe",
  });
  assert.deepEqual(tags, [
    `${IMAGE}:1.0.0-beta.2-candidate`,
    `${IMAGE}:1.0.0-beta.2-deadbee`,
  ]);
});

test("release branch with a non-semver name is rejected", () => {
  assert.throws(
    () =>
      tagsForImage(IMAGE, {
        eventName: "push",
        ref: "refs/heads/release/not-a-version",
        refName: "release/not-a-version",
        sha: "abc1234567890",
      }),
    /release\/<semver>/,
  );
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
