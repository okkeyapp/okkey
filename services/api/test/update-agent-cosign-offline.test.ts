import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP,
  OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
  resolveCosignIdentity,
} from "../src/update-agent/cosign-identity.ts";
import {
  buildCosignVerifyArgs,
  conventionalCosignOffline,
  resolveCosignOfflineMaterial,
} from "../src/update-agent/cosign-offline.ts";
import {
  normalizeImageIdDigest,
  verifyPackageImageSignatures,
  type CosignRunner,
} from "../src/update-agent/cosign-verify.ts";
import { writeMinimalOciLayout } from "../src/update-agent/oci-layout.ts";
import {
  applyVerifiedCorePackage,
  imageRepository,
  type UpdateApplyEngine,
} from "../src/update-agent/apply.ts";
import {
  buildOfflineBundle,
  extractCosignOfflineFromBundleZip,
} from "../src/system-updates/offline-bundle.ts";
import {
  generateUpdateKeyPair,
  parsePayload,
  signOfflinePackage,
  type OfflinePackagePayload,
} from "../src/system-updates/package-format.ts";
import { SystemUpdateError } from "../src/system-updates/errors.ts";
import { planOfflinePathStaging } from "../src/update-agent/docker-cosign.ts";

const CONFIG_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONFIG_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CONFIG_C = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const CONFIG_TAMPERED =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const coreImages = {
  api: "ghcr.io/okkeyapp/api:1.1.0",
  web: "ghcr.io/okkeyapp/web:1.1.0",
  worker: "ghcr.io/okkeyapp/worker:1.1.0",
};

const defaultConfigByKey: Record<string, string> = {
  api: CONFIG_A,
  web: CONFIG_B,
  worker: CONFIG_C,
};

function payload(overrides: Partial<OfflinePackagePayload> = {}): OfflinePackagePayload {
  return {
    format: "okkey-offline-package",
    formatVersion: 1,
    component: "okkey",
    version: "1.1.0",
    fromVersion: "1.0.0",
    summary: "cosign offline test",
    releasedAt: "2026-11-01T00:00:00.000Z",
    imageTag: "1.1.0",
    images: { ...coreImages },
    ...overrides,
  };
}

function engineStub(options?: {
  digests?: Record<string, string>;
  localIds?: Record<string, string>;
  digestError?: Error;
  noLocalId?: boolean;
}): UpdateApplyEngine {
  return {
    async pullImage() {},
    async imageExists() {
      return true;
    },
    async resolveImageDigest(image: string) {
      if (options?.digestError) {
        throw options.digestError;
      }
      const digest = options?.digests?.[image];
      if (!digest) {
        throw new Error(`cannot resolve digest for ${image} after pull (RepoDigests empty)`);
      }
      return `${imageRepository(image)}@${digest}`;
    },
    async resolveLocalImageId(image: string) {
      if (options?.noLocalId) {
        throw new Error(`no local id for ${image}`);
      }
      const id = options?.localIds?.[image];
      if (!id) {
        throw new Error(`no local id for ${image}`);
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

type OfflineRoot = {
  root: string;
  material: { trustedRootPath: string; localImageDirs: Record<string, string> };
  /** OCI config digests written into each layout (Docker image Id). */
  configDigests: Record<string, string>;
  /** OCI manifest digests written into each layout (RepoDigests). */
  manifestDigests: Record<string, string>;
};

async function offlineMaterialRoot(
  keys: string[] = ["api", "web", "worker"],
  options?: { configByKey?: Record<string, string>; emptyLayout?: boolean },
): Promise<OfflineRoot> {
  const root = mkdtempSync(path.join(tmpdir(), "okkey-cosign-offline-"));
  const trustedRootPath = path.join(root, "trusted_root.json");
  writeFileSync(
    trustedRootPath,
    JSON.stringify({ mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=1" }),
  );
  const localImageDirs: Record<string, string> = {};
  const configDigests: Record<string, string> = {};
  const manifestDigests: Record<string, string> = {};
  for (const key of keys) {
    const dir = path.join(root, "cosign", key);
    mkdirSync(dir, { recursive: true });
    if (options?.emptyLayout) {
      writeFileSync(path.join(dir, "signature.json"), `{"image":"${key}"}\n`);
    } else {
      const configDigest = options?.configByKey?.[key] ?? defaultConfigByKey[key] ?? CONFIG_A;
      const written = await writeMinimalOciLayout(dir, { configDigest });
      configDigests[key] = written.configDigest;
      manifestDigests[key] = written.manifestDigest;
    }
    localImageDirs[key] = dir;
  }
  return { root, material: { trustedRootPath, localImageDirs }, configDigests, manifestDigests };
}

function capturingRunner(expectedIdentity: string): {
  runner: CosignRunner;
  calls: string[][];
} {
  const calls: string[][] = [];
  const runner: CosignRunner = async (args) => {
    calls.push([...args]);
    const identityIdx = args.indexOf("--certificate-identity-regexp");
    const identity = identityIdx >= 0 ? args[identityIdx + 1] : "";
    const ok = identity === expectedIdentity;
    return {
      ok,
      exitCode: ok ? 0 : 1,
      stdout: ok ? "verified" : "",
      stderr: ok ? "" : "identity mismatch",
      timedOut: false,
      missingBinary: false,
    };
  };
  return { runner, calls };
}

function okRunner(): CosignRunner {
  return async (args) => {
    assert.ok(args.includes("--offline"));
    return {
      ok: true,
      exitCode: 0,
      stdout: "verified",
      stderr: "",
      timedOut: false,
      missingBinary: false,
    };
  };
}

test("isolated + valid offline material binds OCI layout to loaded image", async () => {
  const { material, configDigests, manifestDigests } = await offlineMaterialRoot();
  const { runner, calls } = capturingRunner(OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP);
  const verified = await verifyPackageImageSignatures({
    images: coreImages,
    component: "okkey",
    envFileContents: "",
    engine: engineStub({
      digests: {
        [coreImages.api]: manifestDigests.api!,
        [coreImages.web]: manifestDigests.web!,
        [coreImages.worker]: manifestDigests.worker!,
      },
      localIds: {
        [coreImages.api]: configDigests.api!,
        [coreImages.web]: configDigests.web!,
        [coreImages.worker]: configDigests.worker!,
      },
    }),
    isolated: true,
    offlineMaterial: material,
    runCosign: runner,
  });
  assert.equal(verified.api, `ghcr.io/okkeyapp/api@${manifestDigests.api}`);
  assert.equal(verified.web, `ghcr.io/okkeyapp/web@${manifestDigests.web}`);
  assert.equal(verified.worker, `ghcr.io/okkeyapp/worker@${manifestDigests.worker}`);
  assert.equal(calls.length, 3);
  for (const args of calls) {
    assert.equal(args[0], "verify");
    assert.ok(args.includes("--offline"));
    assert.ok(args.includes("--trusted-root"));
    assert.ok(args.includes("--local-image"));
    assert.equal(args[args.indexOf("--trusted-root") + 1], material.trustedRootPath);
  }
  assert.equal(calls[0]![argsIndex(calls[0]!, "--local-image") + 1], material.localImageDirs.api);
});

function argsIndex(args: string[], flag: string): number {
  return args.indexOf(flag);
}

test("missing trusted_root is rejected", async () => {
  const { root, material } = await offlineMaterialRoot(["api"]);
  await assert.rejects(
    () =>
      resolveCosignOfflineMaterial({
        payload: payload({ images: { api: coreImages.api } }),
        materialRoot: root,
        declared: {
          trustedRootPath: "missing-root.json",
          localImageDirs: { api: "cosign/api" },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /trusted_root|offline cosign/i);
      return true;
    },
  );
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineStub({ localIds: { [coreImages.api]: CONFIG_A } }),
        isolated: true,
        runCosign: async () => {
          throw new Error("cosign should not run");
        },
      }),
    /offline cosign material is required/,
  );
  assert.ok(material.trustedRootPath);
});

test("missing local-image dir is rejected", async () => {
  const { material } = await offlineMaterialRoot(["api"]);
  await assert.rejects(
    () =>
      resolveCosignOfflineMaterial({
        payload: payload({ images: { api: coreImages.api } }),
        materialRoot: path.dirname(material.trustedRootPath),
        declared: {
          trustedRootPath: "trusted_root.json",
          localImageDirs: { api: "cosign/missing-api" },
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /local-image dir missing/i);
      return true;
    },
  );
});

test("cosign non-zero (tampered/missing sig) yields IMAGE_SIGNATURE_INVALID", async () => {
  const { material, configDigests } = await offlineMaterialRoot(["api"]);
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineStub({ localIds: { [coreImages.api]: configDigests.api! } }),
        isolated: true,
        offlineMaterial: {
          trustedRootPath: material.trustedRootPath,
          localImageDirs: { api: material.localImageDirs.api! },
        },
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
      return true;
    },
  );
});

test("heads/dev without ALLOW_DEV is rejected by identity resolve / verify", async () => {
  assert.equal(
    resolveCosignIdentity({ component: "okkey", processEnv: {}, envFileContents: "" }).identityRegexp,
    OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP,
  );
  assert.equal(OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP.includes("heads/dev"), false);
  assert.ok(OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP.includes("heads/dev"));

  const { material, configDigests } = await offlineMaterialRoot(["api"]);
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        processEnv: {},
        engine: engineStub({ localIds: { [coreImages.api]: configDigests.api! } }),
        isolated: true,
        offlineMaterial: {
          trustedRootPath: material.trustedRootPath,
          localImageDirs: { api: material.localImageDirs.api! },
        },
        runCosign: async (args) => {
          const identityIdx = args.indexOf("--certificate-identity-regexp");
          const identity = identityIdx >= 0 ? (args[identityIdx + 1] ?? "") : "";
          const wantsDev = identity.includes("heads/dev");
          return {
            ok: wantsDev,
            exitCode: wantsDev ? 0 : 1,
            stdout: "",
            stderr: wantsDev ? "" : "identity mismatch: heads/dev not allowed",
            timedOut: false,
            missingBinary: false,
          };
        },
      }),
    /image signature verification failed/,
  );
});

test("empty RepoDigests with matching local Id pins by verified image Id", async () => {
  const { material, configDigests } = await offlineMaterialRoot(["api"]);
  const verified = await verifyPackageImageSignatures({
    images: { api: coreImages.api },
    component: "okkey",
    envFileContents: "",
    engine: engineStub({
      digestError: new Error("cannot resolve digest for image after pull (RepoDigests empty)"),
      localIds: { [coreImages.api]: configDigests.api! },
    }),
    isolated: true,
    offlineMaterial: {
      trustedRootPath: material.trustedRootPath,
      localImageDirs: { api: material.localImageDirs.api! },
    },
    runCosign: okRunner(),
  });
  assert.equal(verified.api, configDigests.api);
  assert.equal(normalizeImageIdDigest(CONFIG_A), CONFIG_A);
  assert.equal(normalizeImageIdDigest(CONFIG_A.slice("sha256:".length)), CONFIG_A);
});

test("tampered bundle (signatures for A, loaded image B) is rejected", async () => {
  // Cosign verifies layout A; docker load left image B tagged as the package ref.
  const { material, configDigests } = await offlineMaterialRoot(["api"], {
    configByKey: { api: CONFIG_A },
  });
  assert.equal(configDigests.api, CONFIG_A);
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineStub({
          digestError: new Error("RepoDigests empty"),
          localIds: { [coreImages.api]: CONFIG_TAMPERED },
        }),
        isolated: true,
        offlineMaterial: {
          trustedRootPath: material.trustedRootPath,
          localImageDirs: { api: material.localImageDirs.api! },
        },
        runCosign: okRunner(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /config digest mismatch|does not match the verified/i);
      return true;
    },
  );
});

test("missing or unreadable OCI config digest is rejected", async () => {
  const { material } = await offlineMaterialRoot(["api"], { emptyLayout: true });
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineStub({ localIds: { [coreImages.api]: CONFIG_A } }),
        isolated: true,
        offlineMaterial: {
          trustedRootPath: material.trustedRootPath,
          localImageDirs: { api: material.localImageDirs.api! },
        },
        runCosign: okRunner(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /verified image digests unavailable/i);
      return true;
    },
  );
});

test("unresolvable local image Id is rejected (no bare-tag fallback)", async () => {
  const { material } = await offlineMaterialRoot(["api"]);
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineStub({ noLocalId: true }),
        isolated: true,
        offlineMaterial: {
          trustedRootPath: material.trustedRootPath,
          localImageDirs: { api: material.localImageDirs.api! },
        },
        runCosign: okRunner(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /local image Id could not be resolved/i);
      return true;
    },
  );
});

test("RepoDigest mismatch against verified OCI manifest is rejected", async () => {
  const { material, configDigests } = await offlineMaterialRoot(["api"]);
  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineStub({
          digests: { [coreImages.api]: CONFIG_TAMPERED },
          localIds: { [coreImages.api]: configDigests.api! },
        }),
        isolated: true,
        offlineMaterial: {
          trustedRootPath: material.trustedRootPath,
          localImageDirs: { api: material.localImageDirs.api! },
        },
        runCosign: okRunner(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /RepoDigest does not match/i);
      return true;
    },
  );
});

test("online mode still requires digest and does not pass --offline", async () => {
  const calls: string[][] = [];
  const DIGEST_A = CONFIG_A;
  const verified = await verifyPackageImageSignatures({
    images: { api: coreImages.api },
    component: "okkey",
    envFileContents: "",
    engine: engineStub({ digests: { [coreImages.api]: DIGEST_A } }),
    isolated: false,
    runCosign: async (args) => {
      calls.push([...args]);
      return {
        ok: true,
        exitCode: 0,
        stdout: "verified",
        stderr: "",
        timedOut: false,
        missingBinary: false,
      };
    },
  });
  assert.equal(verified.api, `ghcr.io/okkeyapp/api@${DIGEST_A}`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.includes("--offline"), false);
  assert.equal(calls[0]!.includes("--trusted-root"), false);
  assert.equal(calls[0]!.includes("--local-image"), false);
  assert.equal(calls[0]![calls[0]!.length - 1], `ghcr.io/okkeyapp/api@${DIGEST_A}`);

  await assert.rejects(
    () =>
      verifyPackageImageSignatures({
        images: { api: coreImages.api },
        component: "okkey",
        envFileContents: "",
        engine: engineStub({
          digestError: new Error("cannot resolve digest for image after pull (RepoDigests empty)"),
        }),
        isolated: false,
        runCosign: async () => {
          throw new Error("cosign should not run without digest");
        },
      }),
    /image digest could not be resolved/,
  );
});

test("apply isolated mode fails closed without offline material and pins with material", async () => {
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-cosign-offline-apply-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0\n");
  const engine = engineStub({
    digests: {
      [coreImages.api]: CONFIG_A,
      [coreImages.web]: CONFIG_B,
      [coreImages.worker]: CONFIG_C,
    },
    localIds: {
      [coreImages.api]: CONFIG_A,
      [coreImages.web]: CONFIG_B,
      [coreImages.worker]: CONFIG_C,
    },
  });

  await assert.rejects(
    () =>
      applyVerifiedCorePackage({
        payload: payload(),
        engine,
        project: "okkey",
        envFilePath: envFile,
        isolated: true,
        processEnv: {},
        runCosign: async () => {
          throw new Error("should not run");
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "IMAGE_SIGNATURE_INVALID");
      assert.match(error.message, /OKKEY_COSIGN_OFFLINE_DIR|offline cosign/i);
      return true;
    },
  );

  const { material, configDigests, manifestDigests } = await offlineMaterialRoot();
  const replaced: string[] = [];
  const pinEngine: UpdateApplyEngine = {
    ...engineStub({
      digests: {
        [coreImages.api]: manifestDigests.api!,
        [coreImages.web]: manifestDigests.web!,
        [coreImages.worker]: manifestDigests.worker!,
      },
      localIds: {
        [coreImages.api]: configDigests.api!,
        [coreImages.web]: configDigests.web!,
        [coreImages.worker]: configDigests.worker!,
      },
    }),
    async replaceContainer(container, image) {
      replaced.push(`${container.service}:${image}`);
      return { async rollback() {}, async commit() {} };
    },
  };
  await applyVerifiedCorePackage({
    payload: payload(),
    engine: pinEngine,
    project: "okkey",
    envFilePath: envFile,
    isolated: true,
    offlineMaterial: material,
    runCosign: okRunner(),
  });
  assert.deepEqual(replaced, [
    `api:ghcr.io/okkeyapp/api@${manifestDigests.api}`,
    `web:ghcr.io/okkeyapp/web@${manifestDigests.web}`,
    `worker:ghcr.io/okkeyapp/worker@${manifestDigests.worker}`,
  ]);
});

test("package-format accepts optional cosignOffline and rejects bad keys", () => {
  const withCosign = parsePayload({
    ...payload(),
    cosignOffline: {
      trustedRootPath: "trusted_root.json",
      localImageDirs: {
        api: "cosign/api",
        web: "cosign/web",
        worker: "cosign/worker",
      },
    },
  });
  assert.equal(withCosign.cosignOffline?.trustedRootPath, "trusted_root.json");
  assert.equal(withCosign.cosignOffline?.localImageDirs.api, "cosign/api");

  assert.throws(
    () =>
      parsePayload({
        ...payload(),
        cosignOffline: {
          trustedRootPath: "trusted_root.json",
          localImageDirs: { other: "cosign/other" },
        },
      }),
    /not a package image/,
  );
  assert.throws(
    () =>
      parsePayload({
        ...payload(),
        cosignOffline: {
          trustedRootPath: "../trusted_root.json",
          localImageDirs: { api: "cosign/api" },
        },
      }),
    /relative path/,
  );
});

test("buildOfflineBundle packs cosign material and extractCosignOfflineFromBundleZip restores it", async () => {
  const keys = generateUpdateKeyPair();
  const core = Buffer.from(
    JSON.stringify(signOfflinePackage(payload(), keys.privateKeyPem)),
    "utf8",
  );
  const enterprisePayload: OfflinePackagePayload = {
    format: "okkey-offline-package",
    formatVersion: 1,
    component: "enterprise",
    version: "2.0.0",
    fromVersion: "1.0.0",
    summary: "Enterprise",
    releasedAt: "2026-11-01T00:00:00.000Z",
    imageTag: "2.0.0",
    minCoreVersion: "1.1.0",
    images: {
      "enterprise-api": "ghcr.io/example/enterprise-api:2.0.0",
      "enterprise-web": "ghcr.io/example/enterprise-web:2.0.0",
      "enterprise-worker": "ghcr.io/example/enterprise-worker:2.0.0",
    },
  };
  const enterprise = Buffer.from(
    JSON.stringify(signOfflinePackage(enterprisePayload, keys.privateKeyPem)),
    "utf8",
  );
  const { root, material } = await offlineMaterialRoot();
  const built = buildOfflineBundle(core, enterprise, {
    trustedRoot: Buffer.from('{"trusted":true}\n', "utf8"),
    cosignDirs: material.localImageDirs,
  });
  assert.equal(built.includesCosignOffline, true);
  assert.equal(built.document, null);

  const dest = mkdtempSync(path.join(tmpdir(), "okkey-cosign-extract-"));
  const extracted = extractCosignOfflineFromBundleZip(built.zip, dest);
  assert.equal(extracted.trustedRootPath, path.join(dest, "trusted_root.json"));
  assert.ok(extracted.localImageDirs.api);
  assert.ok(extracted.localImageDirs.web);
  assert.ok(extracted.localImageDirs.worker);

  const layout = conventionalCosignOffline(["api", "web", "worker"]);
  assert.equal(layout?.trustedRootPath, "trusted_root.json");
  assert.equal(layout?.localImageDirs.api, "cosign/api");

  const args = buildCosignVerifyArgs({
    identity: resolveCosignIdentity({ component: "okkey" }),
    offline: {
      trustedRootPath: extracted.trustedRootPath,
      localImageDir: extracted.localImageDirs.api!,
    },
  });
  assert.deepEqual(args.slice(0, 4), [
    "verify",
    "--offline",
    "--trusted-root",
    extracted.trustedRootPath,
  ]);
  assert.ok(args.includes("--local-image"));

  assert.ok(root.length > 0);
});

test("planOfflinePathStaging rewrites host paths for docker cosign copy", () => {
  const planned = planOfflinePathStaging(
    [
      "verify",
      "--offline",
      "--trusted-root",
      "/var/okkey/offline/trusted_root.json",
      "--certificate-identity-regexp",
      "^x$",
      "--certificate-oidc-issuer",
      "https://token.actions.githubusercontent.com",
      "--local-image",
      "/var/okkey/offline/cosign/api",
    ],
    {},
  );
  assert.ok(planned.copy);
  assert.equal(planned.copy?.trustedRootHost, "/var/okkey/offline/trusted_root.json");
  assert.equal(planned.containerArgs.includes("/tmp/okkey-cosign-offline/trusted_root.json"), true);
  assert.equal(planned.containerArgs.includes("/tmp/okkey-cosign-offline/local-image"), true);

  const bound = planOfflinePathStaging(
    [
      "verify",
      "--offline",
      "--trusted-root",
      "/install/offline/trusted_root.json",
      "--local-image",
      "/install/offline/cosign/api",
    ],
    {
      OKKEY_COSIGN_OFFLINE_HOST_BIND: "1",
      OKKEY_INSTALL_DIR: "/install",
    },
  );
  assert.ok(bound.bind);
  assert.equal(bound.bind?.hostRoot, path.resolve("/install"));
  assert.equal(bound.copy, undefined);
});
