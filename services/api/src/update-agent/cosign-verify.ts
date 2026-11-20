import { spawn, spawnSync } from "node:child_process";

import { SystemUpdateError } from "../system-updates/errors.ts";
import type { UpdateComponent } from "../system-updates/package-format.ts";
import { imageRepository, type UpdateApplyEngine } from "./apply.ts";
import {
  resolveCosignIdentity,
  type CosignComponent,
  type CosignIdentitySettings,
} from "./cosign-identity.ts";
import {
  buildCosignVerifyArgs,
  type CosignOfflineMaterial,
} from "./cosign-offline.ts";
import { normalizeDigest, readOciLayoutImageDigests } from "./oci-layout.ts";

/** Default budget for one `cosign verify` invocation. */
export const COSIGN_VERIFY_TIMEOUT_MS = 60_000;

export type CosignRunResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  missingBinary: boolean;
};

export type CosignRunner = (
  args: readonly string[],
  options: {
    timeoutMs: number;
    /** Optional short-lived registry credentials for private signature pulls. */
    registryCredentials?: {
      server: string;
      username: string;
      password: string;
    };
  },
) => Promise<CosignRunResult>;

export type VerifiedImageDigests = Record<string, string>;

/**
 * Verify every package image with cosign keyless verification, then return
 * digest-pinned refs (`repo@sha256:…`) to use for the container switch.
 * Fail closed: missing cosign, timeout, non-zero exit, or unresolved digest
 * aborts before any container is replaced.
 *
 * Isolated/air-gap mode (TSK-317): requires offlineMaterial and runs
 * `cosign verify --offline --trusted-root … --local-image …`, then binds the
 * verified OCI layout (config digest) to the docker-loaded image Id. A
 * mismatch or missing digest rejects the update (fail closed).
 */
export async function verifyPackageImageSignatures(input: {
  images: Record<string, string>;
  component: UpdateComponent;
  envFileContents: string;
  engine: UpdateApplyEngine;
  processEnv?: NodeJS.ProcessEnv;
  runCosign?: CosignRunner;
  timeoutMs?: number;
  registryCredentials?: {
    server: string;
    username: string;
    password: string;
  };
  /** When true, use offline cosign verify against saved local images (TSK-317). */
  isolated?: boolean;
  /** Absolute offline cosign paths; required when isolated is true. */
  offlineMaterial?: CosignOfflineMaterial;
}): Promise<VerifiedImageDigests> {
  const identity = resolveCosignIdentity({
    component: input.component as CosignComponent,
    processEnv: input.processEnv,
    envFileContents: input.envFileContents,
  });
  const runCosign = input.runCosign ?? defaultCosignRunner;
  const timeoutMs = input.timeoutMs ?? COSIGN_VERIFY_TIMEOUT_MS;
  const verified: VerifiedImageDigests = {};
  const isolated = input.isolated === true;

  if (isolated) {
    const material = input.offlineMaterial;
    if (!material?.trustedRootPath || !material.localImageDirs) {
      throw signatureFailure("(offline)", "offline cosign material is required in isolated mode");
    }
    for (const [key, image] of Object.entries(input.images)) {
      if (!image) {
        continue;
      }
      const localImageDir = material.localImageDirs[key];
      if (!localImageDir) {
        throw signatureFailure(image, `offline cosign local-image dir missing for ${key}`);
      }
      const args = buildCosignVerifyArgs({
        identity,
        offline: {
          trustedRootPath: material.trustedRootPath,
          localImageDir,
        },
      });
      await runCosignVerify({
        args,
        imageLabel: image,
        runCosign,
        timeoutMs,
        // Offline verify must not reach a registry.
        registryCredentials: undefined,
      });
      verified[key] = await bindVerifiedLocalImage({
        engine: input.engine,
        image,
        localImageDir,
      });
    }
    return verified;
  }

  for (const [key, image] of Object.entries(input.images)) {
    if (!image) {
      continue;
    }
    const digestRef = await resolveDigestRef(input.engine, image);
    const args = buildCosignVerifyArgs({
      identity,
      digestRef,
    });
    await runCosignVerify({
      args,
      imageLabel: image,
      runCosign,
      timeoutMs,
      registryCredentials: input.registryCredentials,
    });
    verified[key] = digestRef;
  }
  return verified;
}

export async function verifyDigestRef(input: {
  digestRef: string;
  /** Original package image ref for error messages (may be tag-based). */
  imageLabel: string;
  identity: CosignIdentitySettings;
  runCosign: CosignRunner;
  timeoutMs: number;
  registryCredentials?: {
    server: string;
    username: string;
    password: string;
  };
}): Promise<void> {
  const args = buildCosignVerifyArgs({
    identity: input.identity,
    digestRef: input.digestRef,
  });
  await runCosignVerify({
    args,
    imageLabel: input.imageLabel,
    runCosign: input.runCosign,
    timeoutMs: input.timeoutMs,
    registryCredentials: input.registryCredentials,
  });
}

async function runCosignVerify(input: {
  args: readonly string[];
  imageLabel: string;
  runCosign: CosignRunner;
  timeoutMs: number;
  registryCredentials?: {
    server: string;
    username: string;
    password: string;
  };
}): Promise<void> {
  const result = await input.runCosign(input.args, {
    timeoutMs: input.timeoutMs,
    registryCredentials: input.registryCredentials,
  });

  if (result.missingBinary) {
    throw signatureFailure(
      input.imageLabel,
      "cosign verifier unavailable (not on PATH and Docker cosign runner failed)",
    );
  }
  if (result.timedOut) {
    throw signatureFailure(input.imageLabel, "cosign verify timed out");
  }
  if (!result.ok) {
    throw signatureFailure(input.imageLabel);
  }
}

export function signatureFailure(image: string, detail?: string): SystemUpdateError {
  const suffix = detail ? ` (${detail})` : "";
  return new SystemUpdateError(
    400,
    "IMAGE_SIGNATURE_INVALID",
    `image signature verification failed: ${image}${suffix}`,
  );
}

/**
 * After offline cosign verify of a `cosign save` directory, bind the verified
 * OCI layout to the docker-loaded image and return a pin Docker can start.
 *
 * - Reads config + manifest digests from the verified layout.
 * - Requires docker image Id === OCI config digest (fail closed on mismatch).
 * - When RepoDigests is present, also requires the manifest digest to match.
 * - Pins by verified image Id (`sha256:…`) so compose/engine starts the same
 *   artifact that was verified — never a bare tag, never an unbound digest.
 */
export async function bindVerifiedLocalImage(input: {
  engine: UpdateApplyEngine;
  image: string;
  localImageDir: string;
}): Promise<string> {
  let oci;
  try {
    oci = await readOciLayoutImageDigests(input.localImageDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "OCI layout unreadable";
    throw signatureFailure(input.image, `verified image digests unavailable (${detail})`);
  }
  if (!oci.configDigest || !oci.manifestDigest) {
    throw signatureFailure(input.image, "verified image digests unavailable");
  }

  if (!input.engine.resolveLocalImageId) {
    throw signatureFailure(input.image, "local image Id could not be resolved after offline verify");
  }
  let localId: string;
  try {
    localId = normalizeImageIdDigest(await input.engine.resolveLocalImageId(input.image));
  } catch (error) {
    if (error instanceof SystemUpdateError) {
      throw error;
    }
    throw signatureFailure(input.image, "local image Id could not be resolved after offline verify");
  }
  if (!localId) {
    throw signatureFailure(input.image, "local image Id could not be resolved after offline verify");
  }
  if (localId !== oci.configDigest) {
    throw signatureFailure(
      input.image,
      "loaded image does not match the verified cosign-save artifact (config digest mismatch)",
    );
  }

  // When RepoDigests exists, also require the manifest digest to match.
  if (input.engine.resolveImageDigest) {
    try {
      const digestRef = (await input.engine.resolveImageDigest(input.image)).trim();
      const at = digestRef.lastIndexOf("@");
      const repoDigest = at > 0 ? normalizeDigest(digestRef.slice(at + 1)) : "";
      if (repoDigest && repoDigest !== oci.manifestDigest) {
        throw signatureFailure(
          input.image,
          "loaded image RepoDigest does not match the verified cosign-save manifest",
        );
      }
      if (repoDigest) {
        // Prefer repository@manifestDigest when Docker already has that digest.
        const repo = imageRepository(input.image);
        return `${repo}@${oci.manifestDigest}`;
      }
    } catch (error) {
      if (error instanceof SystemUpdateError && error.code === "IMAGE_SIGNATURE_INVALID") {
        throw error;
      }
      // Empty RepoDigests after docker load is expected — pin by verified Id.
    }
  }

  // Docker Engine accepts the image Id (config digest) as the create Image.
  return localId;
}

/** @deprecated Use bindVerifiedLocalImage — kept name for older tests importing the helper. */
export async function resolveLocalImagePin(
  engine: UpdateApplyEngine,
  image: string,
  localImageDir?: string,
): Promise<string> {
  if (!localImageDir) {
    throw signatureFailure(image, "verified image digests unavailable");
  }
  return bindVerifiedLocalImage({ engine, image, localImageDir });
}

/** Normalize a Docker image Id to `sha256:<hex>` (accepts with or without prefix). */
export function normalizeImageIdDigest(rawId: string): string {
  return normalizeDigest(rawId);
}

export async function defaultCosignRunner(
  args: readonly string[],
  options: { timeoutMs: number },
): Promise<CosignRunResult> {
  if (!cosignOnPath()) {
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "cosign not found on PATH",
      timedOut: false,
      missingBinary: true,
    };
  }
  return await new Promise((resolve) => {
    const child = spawn("cosign", [...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: CosignRunResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        timedOut: true,
        missingBinary: false,
      });
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      const missing =
        error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr: error instanceof Error ? error.message : "cosign failed to start",
        timedOut: false,
        missingBinary: Boolean(missing),
      });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
        timedOut: false,
        missingBinary: false,
      });
    });
  });
}

export function cosignOnPath(): boolean {
  const probe = spawnSync("cosign", ["version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.error && "code" in probe.error && probe.error.code === "ENOENT") {
    return false;
  }
  return probe.status === 0 || probe.status === 1;
}

async function resolveDigestRef(engine: UpdateApplyEngine, image: string): Promise<string> {
  if (image.includes("@sha256:")) {
    return image;
  }
  if (!engine.resolveImageDigest) {
    throw signatureFailure(image, "image digest could not be resolved");
  }
  try {
    const digestRef = (await engine.resolveImageDigest(image)).trim();
    if (!digestRef.includes("@sha256:")) {
      throw signatureFailure(image, "image digest could not be resolved");
    }
    // Prefer the repository from the package image so the pinned ref stays on the same name.
    const repo = imageRepository(image);
    const at = digestRef.lastIndexOf("@");
    const digest = at > 0 ? digestRef.slice(at + 1) : "";
    if (!digest.startsWith("sha256:")) {
      throw signatureFailure(image, "image digest could not be resolved");
    }
    return `${repo}@${digest}`;
  } catch (error) {
    if (error instanceof SystemUpdateError) {
      throw error;
    }
    throw signatureFailure(image, "image digest could not be resolved");
  }
}
