/**
 * Real Docker e2e for offline update bundles.
 * Starts a local registry, signs packages at runtime, and drives the update agent
 * against a disposable compose project.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRecordingDockerEngine,
  postJob,
  startAgent,
  stopAgent,
} from "./helpers/agent.ts";
import {
  composeDown,
  composeUp,
  createComposeHarness,
  readEnvFile,
  serviceImage,
  type ComposeHarness,
} from "./helpers/compose.ts";
import {
  BASE_IMAGE,
  CORE_IMAGE,
  CORE_SERVICES,
  CORE_TAG,
  ENTERPRISE_IMAGE,
  ENTERPRISE_SERVICES,
  ENTERPRISE_TAG,
} from "./helpers/constants.ts";
import {
  buildBundleWithCli,
  corePackage,
  enterprisePackage,
  generateBundleKeys,
  tamperPackageSignature,
} from "./helpers/packages.ts";
import { buildAndPushStubImages, startLocalRegistry, stopLocalRegistry } from "./helpers/registry.ts";

let workDir = "";
let harness: ComposeHarness;

test.before(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "okkey-bundle-e2e-"));
  await startLocalRegistry();
  await buildAndPushStubImages();
  harness = await createComposeHarness(workDir);
});

test.after(async () => {
  await composeDown();
  await stopLocalRegistry();
  if (workDir) {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test.beforeEach(async () => {
  await composeUp(harness);
});

test.afterEach(async () => {
  await composeDown();
});

test("a valid offline bundle applies core first, then enterprise", async () => {
  const keys = generateBundleKeys();
  const document = await buildBundleWithCli(
    path.join(workDir, "happy"),
    corePackage(keys.core.privateKeyPem),
    enterprisePackage(keys.enterprise.privateKeyPem),
  );
  const { engine, replaceOrder } = createRecordingDockerEngine();
  const { server, baseUrl } = await startAgent({
    corePublicKeyPem: keys.core.publicKeyPem,
    enterprisePublicKeyPem: keys.enterprise.publicKeyPem,
    project: harness.project,
    envFilePath: harness.envFilePath,
    engine,
  });
  try {
    const job = await postJob(baseUrl, document);
    assert.equal(job.status, "succeeded");
    assert.deepEqual(job.components, [
      { component: "okkey", version: CORE_TAG, applied: true },
      { component: "enterprise", version: ENTERPRISE_TAG, applied: true },
    ]);
    assert.deepEqual(job.result, {
      scope: "bundle",
      coreVersion: CORE_TAG,
      enterpriseVersion: ENTERPRISE_TAG,
    });
    assert.deepEqual(replaceOrder, [...CORE_SERVICES, ...ENTERPRISE_SERVICES]);

    for (const service of CORE_SERVICES) {
      assert.equal(await serviceImage(service), CORE_IMAGE);
    }
    for (const service of ENTERPRISE_SERVICES) {
      assert.equal(await serviceImage(service), ENTERPRISE_IMAGE);
    }

    const env = await readEnvFile(harness.envFilePath);
    assert.match(env, new RegExp(`OKKEY_IMAGE_TAG=${CORE_TAG}`));
    assert.match(env, new RegExp(`OKKEY_ENTERPRISE_IMAGE_TAG=${ENTERPRISE_TAG}`));
    assert.match(env, new RegExp(`OKKEY_ENTERPRISE_VERSION=${ENTERPRISE_TAG}`));
  } finally {
    await stopAgent(server);
  }
});

test("enterprise health failure keeps core and rolls enterprise back", async () => {
  const keys = generateBundleKeys();
  const document = await buildBundleWithCli(
    path.join(workDir, "partial"),
    corePackage(keys.core.privateKeyPem),
    enterprisePackage(keys.enterprise.privateKeyPem, { badHealth: true }),
  );
  const { engine, replaceOrder } = createRecordingDockerEngine();
  const { server, baseUrl } = await startAgent({
    corePublicKeyPem: keys.core.publicKeyPem,
    enterprisePublicKeyPem: keys.enterprise.publicKeyPem,
    project: harness.project,
    envFilePath: harness.envFilePath,
    engine,
  });
  try {
    const job = await postJob(baseUrl, document);
    assert.equal(job.status, "failed");
    assert.equal(job.errorCode, "BUNDLE_PARTIAL");
    assert.match(job.errorMessage ?? "", /Okkey 1\.2\.0 was applied/);
    assert.match(job.errorMessage ?? "", /Enterprise 2\.0\.0 was not applied/);
    assert.deepEqual(job.result, {
      scope: "partial",
      coreVersion: CORE_TAG,
      enterpriseVersion: ENTERPRISE_TAG,
    });
    assert.deepEqual(job.components, [
      { component: "okkey", version: CORE_TAG, applied: true },
      { component: "enterprise", version: ENTERPRISE_TAG, applied: false },
    ]);
    assert.deepEqual(replaceOrder.slice(0, 3), [...CORE_SERVICES]);
    assert.equal(replaceOrder[3], "enterprise-api");

    for (const service of CORE_SERVICES) {
      assert.equal(await serviceImage(service), CORE_IMAGE);
    }
    for (const service of ENTERPRISE_SERVICES) {
      assert.equal(await serviceImage(service), BASE_IMAGE);
    }

    const env = await readEnvFile(harness.envFilePath);
    assert.match(env, new RegExp(`OKKEY_IMAGE_TAG=${CORE_TAG}`));
    assert.match(env, /OKKEY_ENTERPRISE_IMAGE_TAG=1\.0\.0/);
    assert.match(env, /OKKEY_ENTERPRISE_VERSION=1\.0\.0/);
  } finally {
    await stopAgent(server);
  }
});

test("an invalid core package signature changes nothing", async () => {
  await assertInvalidSignatureLeavesInstallUntouched({
    workName: "bad-core-sig",
    tamper: "core",
  });
});

test("an invalid enterprise package signature changes nothing", async () => {
  await assertInvalidSignatureLeavesInstallUntouched({
    workName: "bad-enterprise-sig",
    tamper: "enterprise",
  });
});

async function assertInvalidSignatureLeavesInstallUntouched(input: {
  workName: string;
  tamper: "core" | "enterprise";
}): Promise<void> {
  const keys = generateBundleKeys();
  const core = corePackage(keys.core.privateKeyPem);
  const enterprise = enterprisePackage(keys.enterprise.privateKeyPem);
  const document = await buildBundleWithCli(
    path.join(workDir, input.workName),
    input.tamper === "core" ? tamperPackageSignature(core) : core,
    input.tamper === "enterprise" ? tamperPackageSignature(enterprise) : enterprise,
  );
  const { engine, replaceOrder } = createRecordingDockerEngine();
  const { server, baseUrl } = await startAgent({
    corePublicKeyPem: keys.core.publicKeyPem,
    enterprisePublicKeyPem: keys.enterprise.publicKeyPem,
    project: harness.project,
    envFilePath: harness.envFilePath,
    engine,
  });
  try {
    const beforeEnv = await readEnvFile(harness.envFilePath);
    const job = await postJob(baseUrl, document);
    assert.equal(job.status, "failed");
    assert.ok(
      job.errorCode === "SIGNATURE_INVALID" || job.errorCode === "PACKAGE_INVALID",
      `unexpected errorCode ${job.errorCode}`,
    );
    assert.deepEqual(replaceOrder, []);

    for (const service of [...CORE_SERVICES, ...ENTERPRISE_SERVICES]) {
      assert.equal(await serviceImage(service), BASE_IMAGE);
    }
    assert.equal(await readEnvFile(harness.envFilePath), beforeEnv);
  } finally {
    await stopAgent(server);
  }
}
