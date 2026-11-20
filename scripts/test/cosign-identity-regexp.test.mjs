import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sharedSh = readFileSync(join(root, "deploy/docker/cosign-identity.sh"), "utf8");
const installSh = readFileSync(join(root, "deploy/docker/install.sh"), "utf8");
const identityTs = readFileSync(
  join(root, "services/api/src/update-agent/cosign-identity.ts"),
  "utf8",
);

function bashSingleQuoted(source, name) {
  const match = source.match(new RegExp(`${name}='([^']*)'`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

function tsStringConst(name) {
  const match = identityTs.match(new RegExp(`export const ${name}\\s*=\\s*\\n?\\s*"([^"]*)"`));
  assert.ok(match, `missing TS ${name}`);
  return JSON.parse(`"${match[1]}"`);
}

const NAMES = [
  "OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP",
  "OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP",
  "OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP",
  "OKKEY_COSIGN_CANDIDATE_DEV_IDENTITY_REGEXP",
  "OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP",
  "OKKEY_COSIGN_ENTERPRISE_DEFAULT_DEV_IDENTITY_REGEXP",
  "OKKEY_COSIGN_ENTERPRISE_CANDIDATE_IDENTITY_REGEXP",
  "OKKEY_COSIGN_ENTERPRISE_CANDIDATE_DEV_IDENTITY_REGEXP",
];

const DEFAULT_RE = bashSingleQuoted(sharedSh, "OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP");
const DEFAULT_DEV_RE = bashSingleQuoted(sharedSh, "OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP");
const CANDIDATE_RE = bashSingleQuoted(sharedSh, "OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP");
const CANDIDATE_DEV_RE = bashSingleQuoted(sharedSh, "OKKEY_COSIGN_CANDIDATE_DEV_IDENTITY_REGEXP");
const ENTERPRISE_DEFAULT_RE = bashSingleQuoted(
  sharedSh,
  "OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP",
);
const ENTERPRISE_DEFAULT_DEV_RE = bashSingleQuoted(
  sharedSh,
  "OKKEY_COSIGN_ENTERPRISE_DEFAULT_DEV_IDENTITY_REGEXP",
);
const WORKFLOW =
  "https://github.com/okkeyapp/okkey/.github/workflows/publish-images.yml@";
const ENTERPRISE_WORKFLOW =
  "https://github.com/okkeyapp/okkey-enterprise/.github/workflows/publish-images.yml@";

function identity(ref, workflow = WORKFLOW) {
  return `${workflow}${ref}`;
}

function matches(pattern, value) {
  return new RegExp(pattern).test(value);
}

test("install.sh, shared shell, and TypeScript keep identical identity regexps", () => {
  for (const name of NAMES) {
    const shared = bashSingleQuoted(sharedSh, name);
    assert.equal(bashSingleQuoted(installSh, name), shared, `install.sh ${name}`);
    assert.equal(tsStringConst(name), shared, `TypeScript ${name}`);
  }
  assert.match(installSh, /source "\$\{SCRIPT_DIR\}\/cosign-identity\.sh"/);
  assert.match(installSh, /OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP|OKKEY_COSIGN_ENTERPRISE/);
  assert.match(installSh, /OKKEY_COSIGN_ALLOW_DEV=1/);
  assert.match(installSh, /--allow-dev/);
});

test("identity regexps are anchored; default excludes heads/dev; candidate aliases default", () => {
  for (const pattern of [
    DEFAULT_RE,
    DEFAULT_DEV_RE,
    CANDIDATE_RE,
    CANDIDATE_DEV_RE,
    ENTERPRISE_DEFAULT_RE,
    ENTERPRISE_DEFAULT_DEV_RE,
  ]) {
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
  assert.equal(ENTERPRISE_DEFAULT_RE.includes("okkey-enterprise"), true);
  assert.equal(ENTERPRISE_DEFAULT_RE.includes("heads/dev"), false);
  assert.equal(ENTERPRISE_DEFAULT_DEV_RE.includes("heads/dev"), true);
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
    assert.equal(matches(ENTERPRISE_DEFAULT_RE, identity(ref, ENTERPRISE_WORKFLOW)), true, ref);
  }
  assert.equal(matches(DEFAULT_RE, identity("refs/heads/dev")), false, "refs/heads/dev");
  assert.equal(
    matches(ENTERPRISE_DEFAULT_RE, identity("refs/heads/dev", ENTERPRISE_WORKFLOW)),
    false,
    "enterprise refs/heads/dev",
  );
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
    assert.equal(matches(ENTERPRISE_DEFAULT_DEV_RE, identity(ref, ENTERPRISE_WORKFLOW)), true, ref);
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

test("install.sh documents allow-dev opt-in and candidate no-op", () => {
  assert.match(installSh, /--allow-dev/);
  assert.match(installSh, /OKKEY_COSIGN_ALLOW_DEV=1/);
  assert.match(installSh, /ALLOW_DEV_FLAG/);
  assert.match(installSh, /Compatibility no-op/);
});
