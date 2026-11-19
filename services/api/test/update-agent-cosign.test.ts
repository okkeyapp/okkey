/**
 * Cosign keyless verify for update-agent apply paths (TSK-317).
 * Mocks cosign at the process boundary; does not spawn a real binary.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP,
  OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
  OKKEY_COSIGN_DEFAULT_OIDC_ISSUER,
  OKKEY_ENTERPRISE_COSIGN_DEFAULT_IDENTITY_REGEXP,
  resolveCosignIdentityRegexp,
  resolveCosignOidcIssuer,
} from "../src/update-agent/cosign-identity.ts";
import {
  digestRefFromRepoDigests,
  shouldSkipCosignVerify,
  verifyTargetImageSignatures,
  type CosignProcessRunner,
} from "../src/update-agent/cosign-verify.ts";
import { applyVerifiedCorePackage, type UpdateApplyEngine } from "../src/update-agent/apply.ts";
import { SystemUpdateError } from "../src/system-updates/errors.ts";
import type { OfflinePackagePayload } from "../src/system-updates/package-format.ts";

const DIGEST = `sha256:${"b".repeat(64)}`;

function corePayload(): OfflinePackagePayload {
  return {
    schemaVersion: 1,
    component: "okkey",
    version: "1.1.0",
    fromVersion: "1.0.0",
    imageTag: "1.1.0",
    images: {
      api: "ghcr.io/okkeyapp/api:1.1.0",
      web: "ghcr.io/okkeyapp/web:1.1.0",
      worker: "ghcr.io/okkeyapp/worker:1.1.0",
    },
  };
}

function stubEngine(calls: string[]): UpdateApplyEngine {
  return {
    async pullImage(image) {
      calls.push(`pull:${image}`);
    },
    async imageExists() {
      return true;
    },
    async resolveImageDigestRef(image) {
      calls.push(`digest:${image}`);
      return `ghcr.io/okkeyapp/${image.includes("web") ? "web" : image.includes("worker") ? "worker" : "api"}@${DIGEST}`;
    },
    async findServiceContainer(_project, service) {
      calls.push(`find:${service}`);
      return { id: service, name: service, service, image: "old" };
    },
    async replaceContainer(container) {
      calls.push(`replace:${container.service}`);
      return {
        async rollback() {
          calls.push(`rollback:${container.service}`);
        },
        async commit() {
          calls.push(`commit:${container.service}`);
        },
      };
    },
    async readEnvFile(filePath) {
      return readFileSync(filePath, "utf8");
    },
    async writeEnvFile(filePath, contents) {
      writeFileSync(filePath, contents, "utf8");
    },
  };
}

test("identity resolve: core default, candidate, enterprise, and operator override", () => {
  assert.equal(resolveCosignIdentityRegexp("core", {}), OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP);
  assert.equal(
    resolveCosignIdentityRegexp("core", { OKKEY_ALLOW_CANDIDATE: "1" }),
    OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP,
  );
  assert.equal(
    resolveCosignIdentityRegexp("enterprise", {}),
    OKKEY_ENTERPRISE_COSIGN_DEFAULT_IDENTITY_REGEXP,
  );
  const custom = "^https://example\\.invalid/workflow@refs/heads/dev$";
  assert.equal(
    resolveCosignIdentityRegexp("core", { OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: custom }),
    custom,
  );
  assert.equal(
    resolveCosignIdentityRegexp("enterprise", { OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: custom }),
    custom,
  );
  assert.equal(resolveCosignOidcIssuer({}), OKKEY_COSIGN_DEFAULT_OIDC_ISSUER);
  assert.equal(
    resolveCosignOidcIssuer({ OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER: "https://example.invalid/oidc" }),
    "https://example.invalid/oidc",
  );
  assert.equal(OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP.includes("heads/dev"), true);
  assert.equal(OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP.includes("heads/release"), false);
  assert.equal(OKKEY_ENTERPRISE_COSIGN_DEFAULT_IDENTITY_REGEXP.includes("heads/dev"), false);
  assert.equal(OKKEY_ENTERPRISE_COSIGN_DEFAULT_IDENTITY_REGEXP.includes("heads/release"), true);
});

test("test bypass is ignored in production builds", () => {
  assert.equal(
    shouldSkipCosignVerify({
      OKKEY_UPDATE_AGENT_COSIGN_TEST_BYPASS: "1",
      NODE_ENV: "production",
      DEPLOY_ENV: "prod",
    }),
    false,
  );
  assert.equal(
    shouldSkipCosignVerify({
      OKKEY_UPDATE_AGENT_COSIGN_TEST_BYPASS: "1",
      NODE_ENV: "test",
      DEPLOY_ENV: "dev",
    }),
    true,
  );
});

test("digestRefFromRepoDigests prefers repository match", () => {
  assert.equal(
    digestRefFromRepoDigests("ghcr.io/okkeyapp/api:1.1.0", [
      "ghcr.io/okkeyapp/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]),
    "ghcr.io/okkeyapp/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(
    digestRefFromRepoDigests(
      "ghcr.io/okkeyapp/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      [],
    ),
    "ghcr.io/okkeyapp/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );
  assert.throws(
    () => digestRefFromRepoDigests("ghcr.io/okkeyapp/api:1.1.0", []),
    /Cannot resolve a registry digest/,
  );
});

test("signed image with the right identity passes; unsigned and wrong workflow are rejected", async () => {
  const seen: string[][] = [];
  let mode: "ok" | "unsigned" | "wrong-identity" = "ok";
  const runner: CosignProcessRunner = async ({ args }) => {
    seen.push(args);
    if (args[0] === "version") {
      return { code: 0, stdout: "v2.5.3", stderr: "" };
    }
    if (mode === "unsigned") {
      return { code: 1, stdout: "", stderr: "no matching signatures" };
    }
    if (mode === "wrong-identity") {
      return { code: 1, stdout: "", stderr: "none of the expected identities matched" };
    }
    const identity = args[args.indexOf("--certificate-identity-regexp") + 1] ?? "";
    if (!identity.includes("publish-images")) {
      return { code: 1, stdout: "", stderr: "wrong identity" };
    }
    return { code: 0, stdout: "verified", stderr: "" };
  };

  mode = "ok";
  await verifyTargetImageSignatures({
    images: ["ghcr.io/okkeyapp/api:1.1.0"],
    kind: "core",
    resolveDigestRef: async () => `ghcr.io/okkeyapp/api@${DIGEST}`,
    runner,
    env: { NODE_ENV: "test", PATH: "/usr/bin" },
    log: () => {},
  });

  mode = "unsigned";
  await assert.rejects(
    () =>
      verifyTargetImageSignatures({
        images: ["ghcr.io/okkeyapp/api:unsigned"],
        kind: "core",
        resolveDigestRef: async () => `ghcr.io/okkeyapp/api@${DIGEST}`,
        runner,
        env: { NODE_ENV: "test", PATH: "/usr/bin" },
        log: () => {},
      }),
    (error: unknown) =>
      error instanceof SystemUpdateError && error.code === "IMAGE_SIGNATURE_INVALID",
  );

  mode = "wrong-identity";
  await assert.rejects(
    () =>
      verifyTargetImageSignatures({
        images: ["ghcr.io/okkeyapp/api:1.1.0"],
        kind: "core",
        resolveDigestRef: async () => `ghcr.io/okkeyapp/api@${DIGEST}`,
        runner,
        env: {
          NODE_ENV: "test",
          PATH: "/usr/bin",
          OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: "^https://evil-workflow$",
        },
        log: () => {},
      }),
    (error: unknown) =>
      error instanceof SystemUpdateError && error.code === "IMAGE_SIGNATURE_INVALID",
  );

  const verifyCalls = seen.filter((args) => args[0] === "verify");
  assert.ok(verifyCalls.length >= 3);
  assert.equal(verifyCalls[0]?.[1], "--certificate-identity-regexp");
  assert.equal(verifyCalls[0]?.[3], "--certificate-oidc-issuer");
  assert.equal(verifyCalls[0]?.[4], OKKEY_COSIGN_DEFAULT_OIDC_ISSUER);
});

test("operator identity override regexp is forwarded to cosign", async () => {
  const custom = "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/heads/dev$";
  let saw = "";
  const runner: CosignProcessRunner = async ({ args }) => {
    if (args[0] === "version") {
      return { code: 0, stdout: "v2.5.3", stderr: "" };
    }
    saw = args[args.indexOf("--certificate-identity-regexp") + 1] ?? "";
    return { code: 0, stdout: "", stderr: "" };
  };
  await verifyTargetImageSignatures({
    images: ["ghcr.io/okkeyapp/api:dev"],
    kind: "core",
    resolveDigestRef: async () => `ghcr.io/okkeyapp/api@${DIGEST}`,
    runner,
    env: {
      NODE_ENV: "test",
      PATH: "/usr/bin",
      OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: custom,
    },
    log: () => {},
  });
  assert.equal(saw, custom);
});

test("missing cosign fails closed without applying", async () => {
  const runner: CosignProcessRunner = async () => ({
    code: 127,
    stdout: "",
    stderr: "not found",
  });
  await assert.rejects(
    () =>
      verifyTargetImageSignatures({
        images: ["ghcr.io/okkeyapp/api:1.1.0"],
        kind: "core",
        resolveDigestRef: async () => `ghcr.io/okkeyapp/api@${DIGEST}`,
        runner,
        env: { NODE_ENV: "test", PATH: "/usr/bin" },
        log: () => {},
      }),
    (error: unknown) =>
      error instanceof SystemUpdateError && error.code === "IMAGE_SIGNATURE_UNAVAILABLE",
  );
});

test("core apply does not replace containers when cosign verify fails", async () => {
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-cosign-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0\n");
  const calls: string[] = [];
  const runner: CosignProcessRunner = async ({ args }) => {
    if (args[0] === "version") {
      return { code: 0, stdout: "v2.5.3", stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "no matching signatures" };
  };
  await assert.rejects(
    () =>
      applyVerifiedCorePackage({
        payload: corePayload(),
        engine: stubEngine(calls),
        project: "okkey",
        envFilePath: envFile,
        isolated: false,
        cosignRunner: runner,
        cosignEnv: { NODE_ENV: "test", PATH: "/usr/bin" },
      }),
    (error: unknown) =>
      error instanceof SystemUpdateError && error.code === "IMAGE_SIGNATURE_INVALID",
  );
  assert.ok(calls.some((call) => call.startsWith("pull:")));
  assert.ok(calls.some((call) => call.startsWith("digest:")));
  assert.equal(calls.some((call) => call.startsWith("replace:")), false);
  assert.equal(readFileSync(envFile, "utf8"), "OKKEY_IMAGE_TAG=1.0.0\n");
});

test("core apply verifies then replaces when cosign passes", async () => {
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-cosign-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0\n");
  const calls: string[] = [];
  const identities: string[] = [];
  const runner: CosignProcessRunner = async ({ args }) => {
    if (args[0] === "version") {
      return { code: 0, stdout: "v2.5.3", stderr: "" };
    }
    identities.push(args[args.indexOf("--certificate-identity-regexp") + 1] ?? "");
    return { code: 0, stdout: "ok", stderr: "" };
  };
  await applyVerifiedCorePackage({
    payload: corePayload(),
    engine: stubEngine(calls),
    project: "okkey",
    envFilePath: envFile,
    isolated: false,
    cosignRunner: runner,
    cosignEnv: { NODE_ENV: "test", PATH: "/usr/bin" },
  });
  assert.equal(identities.length, 3);
  assert.equal(identities[0], OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP);
  const pullAt = calls.findIndex((call) => call.startsWith("pull:"));
  const digestAt = calls.findIndex((call) => call.startsWith("digest:"));
  const replaceAt = calls.findIndex((call) => call.startsWith("replace:"));
  assert.ok(pullAt >= 0 && digestAt > pullAt && replaceAt > digestAt);
  assert.match(readFileSync(envFile, "utf8"), /OKKEY_IMAGE_TAG=1\.1\.0/);
});
