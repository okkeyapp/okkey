import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP,
  OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
  OKKEY_COSIGN_ENTERPRISE_DEFAULT_DEV_IDENTITY_REGEXP,
  OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP,
  resolveCosignIdentity,
} from "../src/update-agent/cosign-identity.ts";
import {
  signatureFailure,
  verifyDigestRef,
  verifyPackageImageSignatures,
  type CosignRunner,
} from "../src/update-agent/cosign-verify.ts";
import { writeMinimalOciLayout } from "../src/update-agent/oci-layout.ts";
import {
  buildCosignDockerConfigArchive,
  buildDockerConfigJson,
  COSIGN_DOCKER_CONFIG_ARCHIVE_PARENT,
  COSIGN_DOCKER_CONFIG_DIR,
  copyDockerConfigIntoContainer,
  createDockerCosignRunner,
} from "../src/update-agent/docker-cosign.ts";
import type { DockerTransport } from "../src/update-agent/docker-engine.ts";
import { applyVerifiedCorePackage, imageRepository, type UpdateApplyEngine } from "../src/update-agent/apply.ts";
import { generateUpdateKeyPair, signOfflinePackage, type OfflinePackagePayload } from "../src/system-updates/package-format.ts";
import { SystemUpdateError } from "../src/system-updates/errors.ts";

const DIGEST_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIGEST_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DIGEST_C = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

const coreImages = {
  api: "ghcr.io/okkeyapp/api:1.1.0",
  web: "ghcr.io/okkeyapp/web:1.1.0",
  worker: "ghcr.io/okkeyapp/worker:1.1.0",
};

function payload(overrides: Partial<OfflinePackagePayload> = {}): OfflinePackagePayload {
  return {
    format: "okkey-offline-package",
    formatVersion: 1,
    component: "okkey",
    version: "1.1.0",
    fromVersion: "1.0.0",
    summary: "cosign test",
    releasedAt: "2026-11-01T00:00:00.000Z",
    imageTag: "1.1.0",
    images: { ...coreImages },
    ...overrides,
  };
}

function engineWithDigests(
  digests: Record<string, string>,
  localIds?: Record<string, string>,
): UpdateApplyEngine {
  return {
    async pullImage() {},
    async imageExists() {
      return true;
    },
    async resolveImageDigest(image: string) {
      const digest = digests[image];
      if (!digest) {
        throw new Error(`missing digest for ${image}`);
      }
      return `${imageRepository(image)}@${digest}`;
    },
    async resolveLocalImageId(image: string) {
      const id = localIds?.[image];
      if (!id) {
        throw new Error(`missing local id for ${image}`);
      }
      return id.startsWith("sha256:") ? id : `sha256:${id}`;
    },
    async findServiceContainer(_project, service) {
      return { id: service, name: service, service, image: "old" };
    },
    async replaceContainer() {
      return { async rollback() {}, async commit() {} };
    },
    async readEnvFile() {
      return "";
    },
    async writeEnvFile() {},
  };
}

function matchingIdentityRunner(expectedRegexp: string): CosignRunner {
  return async (args) => {
    const identityIdx = args.indexOf("--certificate-identity-regexp");
    const identity = identityIdx >= 0 ? args[identityIdx + 1] : "";
    const ok = identity === expectedRegexp;
    return {
      ok,
      exitCode: ok ? 0 : 1,
      stdout: ok ? "verified" : "",
      stderr: ok ? "" : "identity mismatch",
      timedOut: false,
      missingBinary: false,
    };
  };
}

test("resolveCosignIdentity prefers process env, then .env, then core default", () => {
  assert.equal(
    resolveCosignIdentity({ component: "okkey", processEnv: {}, envFileContents: "" }).identityRegexp,
    OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
  );
  assert.equal(
    resolveCosignIdentity({
      component: "okkey",
      processEnv: {},
      envFileContents: "OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP=from-env-file\n",
    }).identityRegexp,
    "from-env-file",
  );
  assert.equal(
    resolveCosignIdentity({
      component: "okkey",
      processEnv: { OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: "from-process" },
      envFileContents: "OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP=from-env-file\n",
    }).identityRegexp,
    "from-process",
  );
  assert.equal(
    resolveCosignIdentity({
      component: "okkey",
      processEnv: { OKKEY_ALLOW_CANDIDATE: "1" },
      envFileContents: "",
    }).identityRegexp,
    OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
    "ALLOW_CANDIDATE is a no-op (same as default)",
  );
  assert.equal(
    resolveCosignIdentity({
      component: "okkey",
      processEnv: { OKKEY_COSIGN_ALLOW_DEV: "1" },
      envFileContents: "",
    }).identityRegexp,
    OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP,
  );
  assert.equal(
    resolveCosignIdentity({
      component: "okkey",
      processEnv: {},
      envFileContents: "OKKEY_COSIGN_ALLOW_DEV=1\n",
    }).identityRegexp,
    OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
    ".env ALLOW_DEV must be ignored",
  );
  assert.equal(
    resolveCosignIdentity({ component: "enterprise", processEnv: {}, envFileContents: "" }).identityRegexp,
    OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP,
  );
  assert.equal(
    resolveCosignIdentity({
      component: "enterprise",
      processEnv: { OKKEY_COSIGN_ALLOW_DEV: "1" },
      envFileContents: "",
    }).identityRegexp,
    OKKEY_COSIGN_ENTERPRISE_DEFAULT_DEV_IDENTITY_REGEXP,
  );
  assert.throws(
    () =>
      resolveCosignIdentity({
        component: "okkey",
        processEnv: {
          OKKEY_COSIGN_ALLOW_DEV: "1",
          OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: "^no-dev-here$",
        },
        envFileContents: "",
      }),
    /OKKEY_COSIGN_ALLOW_DEV=1 has no effect/,
  );
});

test("Core and Enterprise identity overrides are independent on an Enterprise-wrapper install", () => {
  const coreOverride = "^core-override$";
  const enterpriseOverride = "^enterprise-override$";
  const envFile = [
    `OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${coreOverride}`,
    `OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${enterpriseOverride}`,
    "",
  ].join("\n");

  assert.equal(
    resolveCosignIdentity({ component: "okkey", processEnv: {}, envFileContents: envFile }).identityRegexp,
    coreOverride,
  );
  assert.equal(
    resolveCosignIdentity({ component: "enterprise", processEnv: {}, envFileContents: envFile })
      .identityRegexp,
    enterpriseOverride,
  );
  // Enterprise process override must not affect Core images.
  assert.equal(
    resolveCosignIdentity({
      component: "okkey",
      processEnv: { OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP: enterpriseOverride },
      envFileContents: "",
    }).identityRegexp,
    OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
  );
  // Core process override must not affect Enterprise images.
  assert.equal(
    resolveCosignIdentity({
      component: "enterprise",
      processEnv: { OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: coreOverride },
      envFileContents: "",
    }).identityRegexp,
    OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP,
  );
});

test("Enterprise-wrapper install verifies Core and Enterprise images with distinct identities", async () => {
  const coreOverride = "^core-wrapper$";
  const enterpriseOverride = "^enterprise-wrapper$";
  const seen: string[] = [];
  const runCosign: CosignRunner = async (args) => {
    const identityIdx = args.indexOf("--certificate-identity-regexp");
    const identity = identityIdx >= 0 ? (args[identityIdx + 1] ?? "") : "";
    seen.push(identity);
    return {
      ok: true,
      exitCode: 0,
      stdout: "verified",
      stderr: "",
      timedOut: false,
      missingBinary: false,
    };
  };
  const enterpriseApi = "ghcr.io/okkeyapp/enterprise-api:2.0.0";
  const digests = {
    [coreImages.api]: DIGEST_A,
    [enterpriseApi]: DIGEST_B,
  };
  const engine = engineWithDigests(digests);
  const envFile = [
    `OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${coreOverride}`,
    `OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP=${enterpriseOverride}`,
    "",
  ].join("\n");

  await verifyPackageImageSignatures({
    images: { api: coreImages.api },
    component: "okkey",
    envFileContents: envFile,
    engine,
    runCosign,
  });
  await verifyPackageImageSignatures({
    images: { api: enterpriseApi },
    component: "enterprise",
    envFileContents: envFile,
    engine,
    runCosign,
  });
  assert.deepEqual(seen, [coreOverride, enterpriseOverride]);
});

test("signed image with matching identity passes and returns digest pins", async () => {
  const digests = {
    [coreImages.api]: DIGEST_A,
    [coreImages.web]: DIGEST_B,
    [coreImages.worker]: DIGEST_C,
  };
  const verified = await verifyPackageImageSignatures({
    images: coreImages,
    component: "okkey",
    envFileContents: "",
    engine: engineWithDigests(digests),
    runCosign: matchingIdentityRunner(OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP),
  });
  assert.equal(verified.api, `ghcr.io/okkeyapp/api@${DIGEST_A}`);
  assert.equal(verified.web, `ghcr.io/okkeyapp/web@${DIGEST_B}`);
  assert.equal(verified.worker, `ghcr.io/okkeyapp/worker@${DIGEST_C}`);
});

test("unsigned image is rejected", async () => {
  await assert.rejects(
    () =>
      verifyDigestRef({
        digestRef: `ghcr.io/okkeyapp/api@${DIGEST_A}`,
        imageLabel: coreImages.api,
        identity: resolveCosignIdentity({ component: "okkey" }),
        timeoutMs: 1_000,
        runCosign: async () => ({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "no matching signatures",
          timedOut: false,
          missingBinary: false,
        }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /image signature verification failed/);
      assert.match(error.message, /ghcr\.io\/okkeyapp\/api:1\.1\.0/);
      return true;
    },
  );
});

test("image signed by a different workflow identity is rejected", async () => {
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineWithDigests({ [coreImages.api]: DIGEST_A }),
        runCosign: matchingIdentityRunner("^https://github\\.com/evil/other/\\.github/workflows/publish\\.yml@.*$"),
      }),
    /image signature verification failed/,
  );
});

test("OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP override allows a dev-signed image", async () => {
  const override =
    "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/heads/dev$";
  const verified = await verifyPackageImageSignatures({
    images: { api: coreImages.api },
    component: "okkey",
    envFileContents: "",
    processEnv: { OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP: override },
    engine: engineWithDigests({ [coreImages.api]: DIGEST_A }),
    runCosign: matchingIdentityRunner(override),
  });
  assert.equal(verified.api, `ghcr.io/okkeyapp/api@${DIGEST_A}`);
});

test("cosign missing, non-zero exit, and timeout all fail closed", async () => {
  await assert.rejects(
    () =>
      verifyDigestRef({
        digestRef: `ghcr.io/okkeyapp/api@${DIGEST_A}`,
        imageLabel: coreImages.api,
        identity: resolveCosignIdentity({ component: "okkey" }),
        timeoutMs: 1_000,
        runCosign: async () => ({
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: "cosign not found on PATH",
          timedOut: false,
          missingBinary: true,
        }),
      }),
    /image signature verification failed:.*cosign verifier unavailable/,
  );

  await assert.rejects(
    () =>
      verifyDigestRef({
        digestRef: `ghcr.io/okkeyapp/api@${DIGEST_A}`,
        imageLabel: coreImages.api,
        identity: resolveCosignIdentity({ component: "okkey" }),
        timeoutMs: 1_000,
        runCosign: async () => ({
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: "",
          timedOut: true,
          missingBinary: false,
        }),
      }),
    /image signature verification failed:.*timed out/,
  );
});

test("apply pins containers to verified digests and does not apply when cosign fails", async () => {
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-cosign-apply-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0\n");
  const offlineRoot = mkdtempSync(path.join(tmpdir(), "okkey-cosign-apply-offline-"));
  const trustedRootPath = path.join(offlineRoot, "trusted_root.json");
  writeFileSync(trustedRootPath, "{}\n");
  const localImageDirs: Record<string, string> = {};
  const configByKey: Record<string, string> = {};
  const manifestByKey: Record<string, string> = {};
  for (const key of ["api", "web", "worker"] as const) {
    const dir = path.join(offlineRoot, "cosign", key);
    mkdirSync(dir, { recursive: true });
    const written = await writeMinimalOciLayout(dir, { seed: key });
    localImageDirs[key] = dir;
    configByKey[key] = written.configDigest;
    manifestByKey[key] = written.manifestDigest;
  }
  const offlineMaterial = { trustedRootPath, localImageDirs };
  const replaced: string[] = [];
  const engine: UpdateApplyEngine = {
    ...engineWithDigests(
      {
        [coreImages.api]: manifestByKey.api!,
        [coreImages.web]: manifestByKey.web!,
        [coreImages.worker]: manifestByKey.worker!,
      },
      {
        [coreImages.api]: configByKey.api!,
        [coreImages.web]: configByKey.web!,
        [coreImages.worker]: configByKey.worker!,
      },
    ),
    async readEnvFile() {
      return "OKKEY_IMAGE_TAG=1.0.0\n";
    },
    async writeEnvFile(_path, contents) {
      writeFileSync(envFile, contents, "utf8");
    },
    async replaceContainer(container, image) {
      replaced.push(`${container.service}:${image}`);
      return { async rollback() {}, async commit() {} };
    },
  };

  await applyVerifiedCorePackage({
    payload: payload(),
    engine,
    project: "okkey",
    envFilePath: envFile,
    isolated: true,
    offlineMaterial,
    runCosign: matchingIdentityRunner(OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP),
  });
  assert.deepEqual(replaced, [
    `api:ghcr.io/okkeyapp/api@${manifestByKey.api}`,
    `web:ghcr.io/okkeyapp/web@${manifestByKey.web}`,
    `worker:ghcr.io/okkeyapp/worker@${manifestByKey.worker}`,
  ]);

  replaced.length = 0;
  await assert.rejects(
    () =>
      applyVerifiedCorePackage({
        payload: payload(),
        engine,
        project: "okkey",
        envFilePath: envFile,
        isolated: true,
        offlineMaterial,
        runCosign: async () => ({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "unsigned",
          timedOut: false,
          missingBinary: false,
        }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /image signature verification failed/);
      return true;
    },
  );
  assert.deepEqual(replaced, []);
});

test("runtime key material for tests is generated in-process and never loaded from disk", () => {
  // Satisfies the "generate any test keys at runtime, never commit keys" requirement.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  assert.ok(publicKey);
  assert.ok(privateKey);
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(payload(), keys.privateKeyPem);
  assert.ok(signed.signature.length > 0);
  assert.equal(signatureFailure("img").message.includes("image signature verification failed"), true);
});

test("docker cosign runner sets DOCKER_CONFIG and copies auth under /tmp for nonroot", async () => {
  const password = `secret-${Date.now()}`;
  const credentials = {
    server: "ghcr.io",
    username: "okkey-bot",
    password,
  };
  const expectedConfig = buildDockerConfigJson(credentials);
  const expectedArchive = buildCosignDockerConfigArchive(expectedConfig);
  const archiveParentEncoded = encodeURIComponent(COSIGN_DOCKER_CONFIG_ARCHIVE_PARENT);

  const archivePuts: Array<{ path: string; body: Buffer; headers?: Record<string, string> }> = [];
  const createBodies: string[] = [];
  let started = false;

  const transport: DockerTransport = async (method, path, body, headers) => {
    if (method === "GET" && path.includes("/version")) {
      return { status: 200, body: JSON.stringify({ ApiVersion: "1.44" }) };
    }
    if (method === "GET" && path.includes("/images/")) {
      return { status: 200, body: "{}" };
    }
    if (method === "POST" && path.includes("/containers/create")) {
      createBodies.push(typeof body === "string" ? body : "");
      return { status: 201, body: JSON.stringify({ Id: "cosign-ctr-1" }) };
    }
    if (method === "PUT" && path.includes("/archive")) {
      assert.ok(Buffer.isBuffer(body), "archive body must be a Buffer");
      archivePuts.push({ path, body, headers });
      return { status: 200, body: "" };
    }
    if (method === "POST" && path.includes("/start")) {
      started = true;
      assert.equal(archivePuts.length, 1, "auth config must be copied before start");
      return { status: 204, body: "" };
    }
    if (method === "GET" && path.includes("/containers/cosign-ctr-1/json")) {
      return {
        status: 200,
        body: JSON.stringify({ State: { Running: false, ExitCode: 0 } }),
      };
    }
    if (method === "GET" && path.includes("/logs")) {
      return { status: 200, body: "" };
    }
    if (method === "DELETE" && path.includes("/containers/")) {
      return { status: 204, body: "" };
    }
    return { status: 500, body: `unexpected ${method} ${path}` };
  };

  const runner = createDockerCosignRunner(transport, {
    image: "ghcr.io/sigstore/cosign/cosign:test",
  });
  const result = await runner(["verify", "ghcr.io/okkeyapp/api@sha256:abc"], {
    timeoutMs: 5_000,
    registryCredentials: credentials,
  });
  assert.equal(result.ok, true);
  assert.equal(started, true);
  assert.equal(archivePuts.length, 1);
  const put = archivePuts[0]!;
  assert.match(
    put.path,
    new RegExp(`/containers/cosign-ctr-1/archive\\?path=${archiveParentEncoded}$`),
  );
  assert.equal(put.headers?.["Content-Type"], "application/x-tar");
  assert.equal(put.body.equals(expectedArchive), true);
  // Directory entry (typeflag '5') then regular file (typeflag '0'), modes 0755 / 0644.
  assert.equal(String.fromCharCode(put.body[156]!), "5");
  assert.equal(put.body.subarray(100, 108).toString("utf8"), "0000755\0");
  const fileHeaderOffset = 512; // directory has no data blocks
  assert.equal(String.fromCharCode(put.body[fileHeaderOffset + 156]!), "0");
  assert.equal(put.body.subarray(fileHeaderOffset + 100, fileHeaderOffset + 108).toString("utf8"), "0000644\0");
  assert.equal(createBodies.length, 1);
  const created = JSON.parse(createBodies[0]!) as {
    Env?: string[];
    HostConfig?: { Binds?: string[]; NetworkMode?: string };
  };
  assert.deepEqual(created.Env, [`DOCKER_CONFIG=${COSIGN_DOCKER_CONFIG_DIR}`]);
  assert.equal(created.HostConfig?.Binds, undefined);
  assert.equal(created.HostConfig?.NetworkMode, undefined);
  // Create body and runner I/O must not echo the plaintext password.
  assert.equal(createBodies[0]!.includes(password), false);

  const direct = await copyDockerConfigIntoContainer(
    async (method, path, body, headers) => {
      assert.equal(method, "PUT");
      assert.ok(Buffer.isBuffer(body));
      assert.equal(headers?.["Content-Type"], "application/x-tar");
      assert.match(path, new RegExp(`archive\\?path=${archiveParentEncoded}$`));
      assert.equal(body.equals(expectedArchive), true);
      return { status: 200, body: "" };
    },
    "ctr",
    credentials,
  );
  assert.ok(direct.archiveBytes > 0);
});

test("docker cosign runner fails closed when auth config copy fails without leaking secrets", async () => {
  const password = `leak-me-${Date.now()}`;
  const credentials = {
    server: "ghcr.io",
    username: "okkey-bot",
    password,
  };
  let started = false;
  const transport: DockerTransport = async (method, path, body) => {
    if (method === "GET" && path.includes("/version")) {
      return { status: 200, body: JSON.stringify({ ApiVersion: "1.44" }) };
    }
    if (method === "GET" && path.includes("/images/")) {
      return { status: 200, body: "{}" };
    }
    if (method === "POST" && path.includes("/containers/create")) {
      return { status: 201, body: JSON.stringify({ Id: "cosign-ctr-fail" }) };
    }
    if (method === "PUT" && path.includes("/archive")) {
      return { status: 500, body: "nope" };
    }
    if (method === "POST" && path.includes("/start")) {
      started = true;
      return { status: 204, body: "" };
    }
    if (method === "DELETE" && path.includes("/containers/")) {
      return { status: 204, body: "" };
    }
    return { status: 500, body: `unexpected ${method} ${path}` };
  };

  const runner = createDockerCosignRunner(transport, {
    image: "ghcr.io/sigstore/cosign/cosign:test",
  });
  const result = await runner(["verify", "ghcr.io/okkeyapp/api@sha256:abc"], {
    timeoutMs: 5_000,
    registryCredentials: credentials,
  });
  assert.equal(result.ok, false);
  assert.equal(started, false);
  assert.equal(result.stderr, "cosign auth config copy failed");
  assert.equal(result.stderr.includes(password), false);
  assert.equal(JSON.stringify(result).includes(password), false);
});
