import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { SystemUpdateError } from "../src/system-updates/errors.ts";
import {
  BUNDLE_CORE_PATH,
  BUNDLE_ENTERPRISE_PATH,
  BUNDLE_MANIFEST_PATH,
  buildOfflineBundle,
  verifyOfflineBundle,
  writeZip,
} from "../src/system-updates/offline-bundle.ts";
import {
  generateUpdateKeyPair,
  signOfflinePackage,
  type OfflinePackagePayload,
} from "../src/system-updates/package-format.ts";
import { createSystemUpdateService, type UpdateJob } from "../src/system-updates/service.ts";
import { createUpdateAgent } from "../src/update-agent/server.ts";

const corePayload = (overrides: Partial<OfflinePackagePayload> = {}): OfflinePackagePayload => ({
  format: "okkey-offline-package",
  formatVersion: 1,
  component: "okkey",
  version: "1.2.0",
  fromVersion: "1.0.0",
  summary: "Core",
  releasedAt: "2026-11-01T00:00:00.000Z",
  imageTag: "1.2.0",
  images: {
    api: "ghcr.io/okkeyapp/api:1.2.0",
    web: "ghcr.io/okkeyapp/web:1.2.0",
    worker: "ghcr.io/okkeyapp/worker:1.2.0",
  },
  ...overrides,
});

const enterprisePayload = (overrides: Partial<OfflinePackagePayload> = {}): OfflinePackagePayload => ({
  format: "okkey-offline-package",
  formatVersion: 1,
  component: "enterprise",
  version: "2.0.0",
  fromVersion: "1.0.0",
  summary: "Enterprise",
  releasedAt: "2026-11-01T00:00:00.000Z",
  imageTag: "2.0.0",
  minCoreVersion: "1.2.0",
  images: {
    "enterprise-api": "ghcr.io/example/enterprise-api:2.0.0",
    "enterprise-web": "ghcr.io/example/enterprise-web:2.0.0",
    "enterprise-worker": "ghcr.io/example/enterprise-worker:2.0.0",
  },
  ...overrides,
});

function signedBytes(payload: OfflinePackagePayload, privateKeyPem: string): Buffer {
  return Buffer.from(JSON.stringify(signOfflinePackage(payload, privateKeyPem)), "utf8");
}

function bundleDocument(core: Buffer, enterprise: Buffer) {
  return buildOfflineBundle(core, enterprise).document;
}

test("building an archive records core then enterprise and verifies with each key", () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const core = signedBytes(corePayload(), coreKeys.privateKeyPem);
  const enterprise = signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem);
  const built = buildOfflineBundle(core, enterprise);

  assert.equal(built.zip.subarray(0, 2).toString("utf8"), "PK");
  assert.equal(built.document.format, "okkey-offline-bundle");
  assert.equal(built.document.formatVersion, 1);
  const verified = verifyOfflineBundle(built.document, {
    corePublicKeyPem: coreKeys.publicKeyPem,
    enterprisePublicKeyPem: enterpriseKeys.publicKeyPem,
  });
  assert.equal(verified.core.component, "okkey");
  assert.equal(verified.core.version, "1.2.0");
  assert.equal(verified.enterprise.component, "enterprise");
  assert.equal(verified.enterprise.version, "2.0.0");
  assert.equal(Buffer.from(built.document.archiveBase64, "base64").equals(built.zip), true);
});

test("a valid archive applies core before enterprise", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const document = bundleDocument(
    signedBytes(corePayload(), coreKeys.privateKeyPem),
    signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem),
  );
  const envFile = tempEnv("OKKEY_IMAGE_TAG=1.0.0\nOKKEY_ENTERPRISE_IMAGE_TAG=1.0.0\n");
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: coreKeys.publicKeyPem,
    enterprisePublicKeyPem: enterpriseKeys.publicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine: recordingEngine(calls),
  });
  const finished = await postJob(agent, document);
  assert.equal(finished.job.status, "succeeded");
  assert.deepEqual(finished.job.components, [
    { component: "okkey", version: "1.2.0", applied: true },
    { component: "enterprise", version: "2.0.0", applied: true },
  ]);
  const coreReplace = calls.indexOf("replace:api");
  const enterpriseReplace = calls.indexOf("replace:enterprise-api");
  assert.ok(coreReplace >= 0 && enterpriseReplace > coreReplace);
  const env = readFileSync(envFile, "utf8");
  assert.match(env, /OKKEY_IMAGE_TAG=1\.2\.0/);
  assert.match(env, /OKKEY_ENTERPRISE_VERSION=2\.0\.0/);
  assert.equal(calls.some((call) => call.startsWith("rollback:")), false);
});

test("a tampered inner package is rejected before anything changes", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const core = signedBytes(corePayload(), coreKeys.privateKeyPem);
  const enterprise = signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem);
  const flipped = Buffer.from(core);
  flipped[30] ^= 0x1;
  const zip = writeZip([
    { name: BUNDLE_MANIFEST_PATH, data: manifestBytes(core, enterprise) },
    { name: BUNDLE_CORE_PATH, data: flipped },
    { name: BUNDLE_ENTERPRISE_PATH, data: enterprise },
  ]);
  const envFile = tempEnv("OKKEY_IMAGE_TAG=1.0.0\n");
  const calls: string[] = [];
  const finished = await runBundle(zip, coreKeys.publicKeyPem, enterpriseKeys.publicKeyPem, envFile, calls);
  assert.equal(finished.job.errorCode, "PACKAGE_INVALID");
  assert.match(finished.job.errorMessage ?? "", /manifest hash/);
  assert.deepEqual(calls, []);
  assert.equal(readFileSync(envFile, "utf8"), "OKKEY_IMAGE_TAG=1.0.0\n");
});

test("a tampered manifest is rejected before anything changes", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const core = signedBytes(corePayload(), coreKeys.privateKeyPem);
  const enterprise = signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem);
  const manifest = JSON.parse(manifestBytes(core, enterprise).toString("utf8")) as {
    applyOrder: string[];
  };
  manifest.applyOrder = ["enterprise", "okkey"];
  const zip = writeZip([
    { name: BUNDLE_MANIFEST_PATH, data: Buffer.from(JSON.stringify(manifest), "utf8") },
    { name: BUNDLE_CORE_PATH, data: core },
    { name: BUNDLE_ENTERPRISE_PATH, data: enterprise },
  ]);
  const calls: string[] = [];
  const finished = await runBundle(zip, coreKeys.publicKeyPem, enterpriseKeys.publicKeyPem, tempEnv("OKKEY_IMAGE_TAG=1.0.0\n"), calls);
  assert.equal(finished.job.errorCode, "PACKAGE_INVALID");
  assert.match(finished.job.errorMessage ?? "", /core, then enterprise/);
  assert.deepEqual(calls, []);
});

test("an enterprise package signed with the core key is rejected", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const document = bundleDocument(
    signedBytes(corePayload(), coreKeys.privateKeyPem),
    signedBytes(enterprisePayload(), coreKeys.privateKeyPem),
  );
  const calls: string[] = [];
  const finished = await runBundle(
    Buffer.from(document.archiveBase64, "base64"),
    coreKeys.publicKeyPem,
    enterpriseKeys.publicKeyPem,
    tempEnv("OKKEY_IMAGE_TAG=1.0.0\n"),
    calls,
  );
  assert.equal(finished.job.errorCode, "SIGNATURE_INVALID");
  assert.deepEqual(calls, []);
});

test("a swapped package is rejected even when the manifest hashes were rewritten", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const core = signedBytes(corePayload(), coreKeys.privateKeyPem);
  const enterprise = signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem);
  const zip = writeZip([
    { name: BUNDLE_MANIFEST_PATH, data: manifestBytes(enterprise, core) },
    { name: BUNDLE_CORE_PATH, data: enterprise },
    { name: BUNDLE_ENTERPRISE_PATH, data: core },
  ]);
  const calls: string[] = [];
  const finished = await runBundle(zip, coreKeys.publicKeyPem, enterpriseKeys.publicKeyPem, tempEnv("OKKEY_IMAGE_TAG=1.0.0\n"), calls);
  assert.equal(finished.job.errorCode, "SIGNATURE_INVALID");
  assert.deepEqual(calls, []);
});

test("a path traversal entry rejects the archive before anything changes", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const core = signedBytes(corePayload(), coreKeys.privateKeyPem);
  const enterprise = signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem);
  const zip = writeZip([
    { name: BUNDLE_MANIFEST_PATH, data: manifestBytes(core, enterprise) },
    { name: "../evil.txt", data: Buffer.from("nope", "utf8") },
    { name: BUNDLE_CORE_PATH, data: core },
    { name: BUNDLE_ENTERPRISE_PATH, data: enterprise },
  ]);
  const calls: string[] = [];
  const finished = await runBundle(zip, coreKeys.publicKeyPem, enterpriseKeys.publicKeyPem, tempEnv("OKKEY_IMAGE_TAG=1.0.0\n"), calls);
  assert.equal(finished.job.errorCode, "PACKAGE_INVALID");
  assert.match(finished.job.errorMessage ?? "", /path is not allowed/);
  assert.deepEqual(calls, []);
});

test("an oversized or highly compressed entry is rejected", () => {
  const bomb = writeZip([{ name: BUNDLE_MANIFEST_PATH, data: Buffer.alloc(700 * 1024, 0) }]);
  assertBundleError(wrap(bomb), /expands too far|size limit/);

  const small = writeZip([{ name: BUNDLE_MANIFEST_PATH, data: Buffer.from("{}", "utf8") }]);
  const declared = Buffer.from(small);
  const eocd = declared.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const central = declared.readUInt32LE(eocd + 16);
  declared.writeUInt32LE(50_000_000, 22);
  declared.writeUInt32LE(50_000_000, central + 24);
  assertBundleError(wrap(declared), /size limit/);
});

test("an unknown manifest component rejects the archive", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const core = signedBytes(corePayload(), coreKeys.privateKeyPem);
  const enterprise = signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem);
  const manifest = JSON.parse(manifestBytes(core, enterprise).toString("utf8")) as {
    packages: Array<{ component: string }>;
  };
  manifest.packages.push({ component: "plugin", path: "packages/plugin.okpkg", sha256: "ab".repeat(32) } as {
    component: string;
  });
  const zip = writeZip([
    { name: BUNDLE_MANIFEST_PATH, data: Buffer.from(JSON.stringify(manifest), "utf8") },
    { name: BUNDLE_CORE_PATH, data: core },
    { name: BUNDLE_ENTERPRISE_PATH, data: enterprise },
  ]);
  const calls: string[] = [];
  const finished = await runBundle(zip, coreKeys.publicKeyPem, enterpriseKeys.publicKeyPem, tempEnv("OKKEY_IMAGE_TAG=1.0.0\n"), calls);
  assert.equal(finished.job.errorCode, "PACKAGE_INVALID");
  assert.match(finished.job.errorMessage ?? "", /unknown component|core and enterprise only/);
  assert.deepEqual(calls, []);
});

test("enterprise failure after core succeeded keeps core and rolls enterprise back", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const document = bundleDocument(
    signedBytes(corePayload(), coreKeys.privateKeyPem),
    signedBytes(enterprisePayload(), enterpriseKeys.privateKeyPem),
  );
  const envFile = tempEnv("OKKEY_IMAGE_TAG=1.0.0\nOKKEY_ENTERPRISE_IMAGE_TAG=1.0.0\n");
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: coreKeys.publicKeyPem,
    enterprisePublicKeyPem: enterpriseKeys.publicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine: {
      ...recordingEngine(calls),
      async pullImage(image: string) {
        calls.push(`pull:${image}`);
        if (image.includes("enterprise")) {
          throw new Error("registry unreachable");
        }
      },
    },
  });
  const finished = await postJob(agent, document);
  assert.equal(finished.job.status, "failed");
  assert.equal(finished.job.errorCode, "BUNDLE_PARTIAL");
  assert.match(finished.job.errorMessage ?? "", /Okkey 1\.2\.0 was applied/);
  assert.match(finished.job.errorMessage ?? "", /Enterprise 2\.0\.0 was not applied/);
  assert.match(finished.job.errorMessage ?? "", /rolled back/);
  assert.deepEqual(finished.job.components, [
    { component: "okkey", version: "1.2.0", applied: true },
    { component: "enterprise", version: "2.0.0", applied: false },
  ]);
  assert.ok(calls.includes("commit:api"));
  assert.equal(calls.some((call) => call.startsWith("rollback:api")), false);
  assert.equal(calls.includes("replace:enterprise-api"), false);
  const env = readFileSync(envFile, "utf8");
  assert.match(env, /OKKEY_IMAGE_TAG=1\.2\.0/);
  assert.match(env, /OKKEY_ENTERPRISE_IMAGE_TAG=1\.0\.0/);
  assert.equal(env.includes("OKKEY_ENTERPRISE_VERSION=2.0.0"), false);
});

test("the offline upload API forwards the bundle and reports archive support", async () => {
  const forwarded: unknown[] = [];
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    feedUrl: "",
    isolated: true,
    agent: {
      async start(document) {
        forwarded.push(document);
        return {
          id: "11111111-1111-4111-8111-111111111111",
          status: "verifying",
          progress: 5,
          component: "okkey",
          fromVersion: "",
          toVersion: "",
        };
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => true,
  });
  const status = await service.statusFor("owner");
  assert.equal(status.offlineArchiveSupported, true);
  const document = {
    format: "okkey-offline-bundle",
    formatVersion: 1,
    archiveBase64: "AAAA",
  };
  await service.apply("owner", { source: "file", document });
  assert.deepEqual(forwarded, [document]);
});

function manifestBytes(core: Buffer, enterprise: Buffer): Buffer {
  const manifest = {
    format: "okkey-offline-bundle",
    formatVersion: 1,
    applyOrder: ["okkey", "enterprise"],
    packages: [
      { component: "okkey", path: BUNDLE_CORE_PATH, sha256: createHash("sha256").update(core).digest("hex") },
      {
        component: "enterprise",
        path: BUNDLE_ENTERPRISE_PATH,
        sha256: createHash("sha256").update(enterprise).digest("hex"),
      },
    ],
  };
  return Buffer.from(JSON.stringify(manifest), "utf8");
}

function assertBundleError(document: unknown, message: RegExp): void {
  try {
    verifyOfflineBundle(document, { corePublicKeyPem: "unused", enterprisePublicKeyPem: "unused" });
  } catch (error) {
    assert.ok(error instanceof SystemUpdateError);
    assert.equal(error.code, "PACKAGE_INVALID");
    assert.match(error.message, message);
    return;
  }
  assert.fail("bundle was accepted");
}

function wrap(zip: Buffer) {
  return {
    format: "okkey-offline-bundle" as const,
    formatVersion: 1 as const,
    archiveBase64: zip.toString("base64"),
  };
}

function tempEnv(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-bundle-"));
  const envFile = path.join(dir, ".env");
  writeFileSync(envFile, contents);
  return envFile;
}

async function runBundle(
  zip: Buffer,
  corePublicKeyPem: string,
  enterprisePublicKeyPem: string,
  envFile: string,
  calls: string[],
): Promise<{ job: UpdateJob }> {
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: corePublicKeyPem,
    enterprisePublicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine: recordingEngine(calls),
  });
  return postJob(agent, wrap(zip));
}

function recordingEngine(calls: string[]) {
  return {
    async pullImage(image: string) {
      calls.push(`pull:${image}`);
    },
    async imageExists() {
      calls.push("exists");
      return true;
    },
    async findServiceContainer(_project: string, service: string) {
      calls.push(`find:${service}`);
      return { id: service, name: service, service, image: "old" };
    },
    async replaceContainer(container: { service: string }) {
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
  };
}

async function postJob(
  agent: ReturnType<typeof createUpdateAgent>,
  document: unknown,
): Promise<{ job: UpdateJob }> {
  const response = new MockResponse();
  await agent.handler(fakeRequest(document), response as unknown as ServerResponse);
  assert.equal(response.statusCode, 202);
  const started = JSON.parse(response.body) as { job: UpdateJob };
  await agent.settle();
  const follow = new MockResponse();
  await agent.handler(
    fakeRequest(undefined, "GET", `/v1/jobs/${started.job.id}`),
    follow as unknown as ServerResponse,
  );
  assert.equal(follow.statusCode, 200);
  return JSON.parse(follow.body) as { job: UpdateJob };
}

function fakeRequest(document: unknown, method = "POST", url = "/v1/jobs"): IncomingMessage {
  const raw = document === undefined ? "" : JSON.stringify(document);
  const chunks = raw ? [Buffer.from(raw)] : [];
  return {
    method,
    url,
    headers: { authorization: "Bearer secret" },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as unknown as IncomingMessage;
}

class MockResponse {
  statusCode = 200;
  body = "";
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
  }
}
