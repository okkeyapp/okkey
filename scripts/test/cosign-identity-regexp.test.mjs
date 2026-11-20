import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const installSh = readFileSync(join(root, "deploy/docker/install.sh"), "utf8");

function bashSingleQuoted(name) {
  const match = installSh.match(new RegExp(`${name}='([^']*)'`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

const DEFAULT_RE = bashSingleQuoted("OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP");
const DEFAULT_DEV_RE = bashSingleQuoted("OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP");
const CANDIDATE_RE = bashSingleQuoted("OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP");
const CANDIDATE_DEV_RE = bashSingleQuoted("OKKEY_COSIGN_CANDIDATE_DEV_IDENTITY_REGEXP");
const WORKFLOW =
  "https://github.com/okkeyapp/okkey/.github/workflows/publish-images.yml@";

function identity(ref) {
  return `${WORKFLOW}${ref}`;
}

/** cosign uses an unanchored search; ^ and $ make that a full-string match. */
function matches(pattern, value) {
  return new RegExp(pattern).test(value);
}

test("identity regexps are anchored full workflow URLs", () => {
  for (const pattern of [DEFAULT_RE, DEFAULT_DEV_RE, CANDIDATE_RE, CANDIDATE_DEV_RE]) {
    assert.equal(pattern.startsWith("^"), true, pattern);
    assert.equal(pattern.endsWith("$"), true, pattern);
    assert.match(pattern, /github\\\.com/);
    assert.match(pattern, /publish-images\\\.yml/);
  }
  assert.equal(DEFAULT_RE.includes("heads/dev"), false);
  assert.equal(DEFAULT_RE.includes("heads/release"), true);
  assert.equal(DEFAULT_RE.includes("heads/hotfix"), true);
  assert.equal(CANDIDATE_RE, DEFAULT_RE, "candidate alias equals default");
  assert.equal(CANDIDATE_DEV_RE, DEFAULT_DEV_RE, "candidate+dev alias equals default+dev");
  assert.equal(CANDIDATE_RE.includes("heads/dev"), false);
});

test("default identity accepts release, hotfix, and semver tags (not heads/dev)", () => {
  for (const ref of [
    "refs/heads/release/1.0.0-beta.3",
    "refs/heads/release/1.0.0-beta.2",
    "refs/heads/hotfix/1.2.3",
    "refs/heads/hotfix/1.0.0-beta.3",
    "refs/tags/v9.9.9",
    "refs/tags/v1.0.0",
    "refs/tags/v1.0.0-beta.2",
    "refs/tags/v1.0.0-beta.3",
  ]) {
    assert.equal(matches(DEFAULT_RE, identity(ref)), true, ref);
  }
  assert.equal(matches(DEFAULT_RE, identity("refs/heads/dev")), false, "refs/heads/dev");
});

test("default identity rejects near-miss refs", () => {
  const rejected = [
    "refs/heads/dev",
    "refs/heads/dev-evil",
    "refs/heads/develop",
    "refs/heads/dev/extra",
    "xrefs/heads/dev",
    "refs/tags/v1.0.0evil",
    "refs/tags/v1.0.0-beta.2/extra",
    "refs/tags/v9.9.9_extra",
    "refs/tags/v1.0.0-beta.2.extra!",
    "refs/heads/release-evil",
    "refs/heads/hotfix-evil",
    "refs/heads/releases/1.0.0",
    "refs/heads/release/",
    "refs/heads/main",
    "refs/heads/feature/x",
  ];
  for (const ref of rejected) {
    assert.equal(matches(DEFAULT_RE, identity(ref)), false, ref);
  }
  assert.equal(
    matches(DEFAULT_RE, `x${identity("refs/tags/v1.0.0")}`),
    false,
    "prefixed url",
  );
  assert.equal(
    matches(DEFAULT_RE, `${identity("refs/tags/v1.0.0")}x`),
    false,
    "tag suffix",
  );
  assert.equal(
    matches(
      DEFAULT_RE,
      "https://github.com/okkeyapp/okkey/.github/workflows/other.yml@refs/tags/v1.0.0",
    ),
    false,
  );
  assert.equal(
    matches(DEFAULT_RE, `${identity("refs/heads/release/1.0.0-beta.3")}/extra`),
    false,
  );
  assert.equal(
    matches(DEFAULT_RE, `${identity("refs/heads/hotfix/1.2.3")} `),
    false,
  );
});

test("allow-dev adds heads/dev to the default release/hotfix/tag set", () => {
  for (const ref of [
    "refs/heads/dev",
    "refs/tags/v1.0.0-beta.2",
    "refs/tags/v9.9.9",
    "refs/heads/release/1.0.0-beta.2",
    "refs/heads/hotfix/1.2.3",
  ]) {
    assert.equal(matches(DEFAULT_DEV_RE, identity(ref)), true, ref);
  }
  for (const ref of [
    "refs/heads/dev-evil",
    "refs/heads/develop",
    "refs/heads/main",
    "refs/heads/feature/x",
    "refs/heads/release-evil",
    "refs/heads/hotfix-evil",
    "refs/tags/v1.0.0evil",
  ]) {
    assert.equal(matches(DEFAULT_DEV_RE, identity(ref)), false, ref);
  }
});

test("allow-candidate alias matches the default set", () => {
  for (const ref of [
    "refs/tags/v1.0.0-beta.2",
    "refs/heads/release/1.0.0-beta.2",
    "refs/heads/release/v1.0.0-beta.2",
    "refs/heads/hotfix/1.2.3",
  ]) {
    assert.equal(matches(CANDIDATE_RE, identity(ref)), true, ref);
  }
  for (const ref of [
    "refs/heads/dev",
    "refs/heads/dev-evil",
    "xrefs/heads/dev",
    "refs/heads/release-evil",
    "refs/heads/hotfix-evil",
    "refs/heads/releases/1.0.0",
    "refs/heads/release/",
    "refs/tags/v1.0.0evil",
    "refs/tags/v9.9.9_extra",
  ]) {
    assert.equal(matches(CANDIDATE_RE, identity(ref)), false, ref);
  }
});

test("allow-candidate + allow-dev alias matches default+dev", () => {
  for (const ref of [
    "refs/heads/dev",
    "refs/tags/v1.0.0-beta.2",
    "refs/heads/release/1.0.0-beta.2",
    "refs/heads/hotfix/1.2.3",
  ]) {
    assert.equal(matches(CANDIDATE_DEV_RE, identity(ref)), true, ref);
  }
  for (const ref of [
    "refs/heads/dev-evil",
    "refs/heads/main",
    "refs/heads/feature/x",
    "refs/heads/release-evil",
    "refs/heads/hotfix-evil",
  ]) {
    assert.equal(matches(CANDIDATE_DEV_RE, identity(ref)), false, ref);
  }
});

test("install.sh documents allow-dev opt-in and candidate no-op", () => {
  assert.match(installSh, /--allow-dev/);
  assert.match(installSh, /OKKEY_COSIGN_ALLOW_DEV=1/);
  assert.match(installSh, /ALLOW_DEV_FLAG/);
  assert.match(installSh, /Compatibility no-op/);
  assert.match(installSh, /OKKEY_COSIGN_ALLOW_DEV=1 \(process env, not \.env\)/);
});
