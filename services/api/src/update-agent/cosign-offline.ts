import { access, constants, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { SystemUpdateError } from "../system-updates/errors.ts";
import { extractCosignOfflineFromBundleZip } from "../system-updates/offline-bundle.ts";
import type {
  OfflinePackageCosignOffline,
  OfflinePackagePayload,
} from "../system-updates/package-format.ts";
import type { CosignIdentitySettings } from "./cosign-identity.ts";

function offlineSignatureFailure(image: string, detail: string): SystemUpdateError {
  return new SystemUpdateError(
    400,
    "IMAGE_SIGNATURE_INVALID",
    `image signature verification failed: ${image} (${detail})`,
  );
}

/** Conventional trusted-root filename under OKKEY_COSIGN_OFFLINE_DIR (TSK-317). */
export const COSIGN_OFFLINE_TRUSTED_ROOT = "trusted_root.json";

/** Conventional per-image cosign-save directory prefix (TSK-317). */
export const COSIGN_OFFLINE_IMAGE_DIR_PREFIX = "cosign";

/**
 * Absolute paths to offline cosign material after resolution against a material root.
 * Used only in isolated/air-gap mode (TSK-317).
 */
export type CosignOfflineMaterial = {
  trustedRootPath: string;
  localImageDirs: Record<string, string>;
};

export type ResolveCosignOfflineMaterialInput = {
  payload: OfflinePackagePayload;
  /** Absolute air-gap material root (OKKEY_COSIGN_OFFLINE_DIR or extracted tree). */
  materialRoot: string;
  /**
   * Optional explicit relative layout. When omitted, uses payload.cosignOffline
   * or the conventional `trusted_root.json` + `cosign/<image-key>/` layout.
   */
  declared?: OfflinePackageCosignOffline;
};

/**
 * Join materialRoot with relative paths and fail closed if the trusted root
 * file or any local-image directory is missing.
 */
export async function resolveCosignOfflineMaterial(
  input: ResolveCosignOfflineMaterialInput,
): Promise<CosignOfflineMaterial> {
  const root = path.resolve(input.materialRoot.trim());
  if (!root) {
    throw offlineSignatureFailure("(offline)", "offline cosign material root is missing");
  }
  const declared =
    input.declared ??
    input.payload.cosignOffline ??
    conventionalCosignOffline(Object.keys(input.payload.images));
  if (!declared) {
    throw offlineSignatureFailure("(offline)", "offline cosign material layout is missing");
  }

  const trustedRootPath = path.resolve(root, declared.trustedRootPath);
  await assertFile(trustedRootPath, "trusted_root");

  const localImageDirs: Record<string, string> = {};
  for (const key of Object.keys(input.payload.images)) {
    const relative = declared.localImageDirs[key];
    if (!relative) {
      throw offlineSignatureFailure(
        input.payload.images[key] ?? key,
        `offline cosign local-image dir missing for ${key}`,
      );
    }
    const abs = path.resolve(root, relative);
    await assertDirectory(abs, key);
    localImageDirs[key] = abs;
  }
  return { trustedRootPath, localImageDirs };
}

/**
 * Conventional air-gap layout (TSK-317):
 *   $ROOT/trusted_root.json
 *   $ROOT/cosign/api/ …
 * Enterprise image keys use the same pattern (`cosign/enterprise-api/`, …).
 * Enterprise package builders live outside this repository; ship this layout
 * beside the signed package (or set payload.cosignOffline).
 */
export function conventionalCosignOffline(
  imageKeys: readonly string[],
): OfflinePackageCosignOffline | null {
  const keys = imageKeys.filter((key) => key.trim() !== "");
  if (keys.length === 0) {
    return null;
  }
  const localImageDirs: Record<string, string> = {};
  for (const key of keys) {
    localImageDirs[key] = `${COSIGN_OFFLINE_IMAGE_DIR_PREFIX}/${key}`;
  }
  return {
    trustedRootPath: COSIGN_OFFLINE_TRUSTED_ROOT,
    localImageDirs,
  };
}

export type PreparedCosignOffline = {
  material: CosignOfflineMaterial | undefined;
  /** Remove a temp extract directory created for this apply (no-op otherwise). */
  cleanup: () => Promise<void>;
};

/**
 * Resolve offline material for an apply (TSK-317):
 * 1. `offlineMaterial` test hook (already absolute),
 * 2. else material already under `cosignOfflineRoot` / `OKKEY_COSIGN_OFFLINE_DIR`,
 * 3. else extract from `bundleZip` / `OKKEY_COSIGN_OFFLINE_BUNDLE_ZIP` into a
 *    temp dir under the offline root (cleaned up by the caller).
 */
export async function prepareApplyCosignOfflineMaterial(input: {
  payload: OfflinePackagePayload;
  isolated: boolean;
  offlineMaterial?: CosignOfflineMaterial;
  cosignOfflineRoot?: string;
  /** Optional air-gap zip bytes (integration / upload helper). */
  bundleZip?: Buffer;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<PreparedCosignOffline> {
  const noop = async (): Promise<void> => {};
  if (!input.isolated) {
    return { material: undefined, cleanup: noop };
  }
  if (input.offlineMaterial) {
    await assertFile(input.offlineMaterial.trustedRootPath, "trusted_root");
    for (const [key, dir] of Object.entries(input.offlineMaterial.localImageDirs)) {
      await assertDirectory(dir, key);
    }
    return { material: input.offlineMaterial, cleanup: noop };
  }

  const env = input.processEnv ?? process.env;
  const root = (input.cosignOfflineRoot ?? env.OKKEY_COSIGN_OFFLINE_DIR ?? "").trim();
  if (root) {
    try {
      const material = await resolveCosignOfflineMaterial({
        payload: input.payload,
        materialRoot: root,
      });
      return { material, cleanup: noop };
    } catch (error) {
      // Fall through to zip extract when the conventional tree is not populated yet.
      if (!(error instanceof SystemUpdateError) || error.code !== "IMAGE_SIGNATURE_INVALID") {
        throw error;
      }
    }
  }

  const staged = await stageCosignOfflineFromBundleZip({
    bundleZip: input.bundleZip,
    processEnv: env,
    offlineRoot: root || undefined,
  });
  if (!staged) {
    throw offlineSignatureFailure(
      "(offline)",
      "isolated mode requires OKKEY_COSIGN_OFFLINE_DIR or offline cosign material",
    );
  }
  const material = await resolveCosignOfflineMaterial({
    payload: input.payload,
    materialRoot: staged.materialRoot,
  });
  return { material, cleanup: staged.cleanup };
}

/** @deprecated Prefer prepareApplyCosignOfflineMaterial (supports zip staging + cleanup). */
export async function resolveApplyCosignOfflineMaterial(input: {
  payload: OfflinePackagePayload;
  isolated: boolean;
  offlineMaterial?: CosignOfflineMaterial;
  cosignOfflineRoot?: string;
  bundleZip?: Buffer;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<CosignOfflineMaterial | undefined> {
  const prepared = await prepareApplyCosignOfflineMaterial(input);
  // Legacy callers do not clean up; only use when no temp extract was created.
  return prepared.material;
}

/**
 * Extract `trusted_root.json` + `cosign/<key>/` from an air-gap bundle zip into
 * a fresh directory the update-agent / cosign runner can read. Returns null when
 * no zip bytes/path are available.
 */
export async function stageCosignOfflineFromBundleZip(input: {
  bundleZip?: Buffer;
  /** Absolute offline root; temp extract is created underneath when set. */
  offlineRoot?: string;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<{ materialRoot: string; cleanup: () => Promise<void> } | null> {
  const env = input.processEnv ?? process.env;
  let zipBytes = input.bundleZip;
  if (!zipBytes) {
    const zipPath = (env.OKKEY_COSIGN_OFFLINE_BUNDLE_ZIP ?? "").trim();
    if (!zipPath) {
      return null;
    }
    try {
      zipBytes = await readFile(zipPath);
    } catch {
      throw offlineSignatureFailure(
        "(offline)",
        "OKKEY_COSIGN_OFFLINE_BUNDLE_ZIP could not be read",
      );
    }
  }

  const parent = (input.offlineRoot ?? "").trim() || path.join(tmpdir(), "okkey-cosign-offline");
  await mkdirp(parent);
  const materialRoot = await mkdtemp(path.join(parent, "extract-"));
  try {
    extractCosignOfflineFromBundleZip(zipBytes, materialRoot);
  } catch (error) {
    await rm(materialRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return {
    materialRoot,
    cleanup: async () => {
      await rm(materialRoot, { recursive: true, force: true }).catch(() => {});
    },
  };
}

async function mkdirp(dir: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
}

/**
 * Build `cosign verify` argv for online digest verify or offline local-image verify.
 */
export function buildCosignVerifyArgs(input: {
  identity: CosignIdentitySettings;
  offline?: { trustedRootPath: string; localImageDir: string };
  /** Online mode: digest-pinned image reference. Ignored when offline is set. */
  digestRef?: string;
}): string[] {
  const identityFlags = [
    "--certificate-identity-regexp",
    input.identity.identityRegexp,
    "--certificate-oidc-issuer",
    input.identity.oidcIssuer,
  ];
  if (input.offline) {
    return [
      "verify",
      "--offline",
      "--trusted-root",
      input.offline.trustedRootPath,
      ...identityFlags,
      "--local-image",
      input.offline.localImageDir,
    ];
  }
  const digestRef = (input.digestRef ?? "").trim();
  if (!digestRef) {
    throw new SystemUpdateError(
      400,
      "IMAGE_SIGNATURE_INVALID",
      "image signature verification failed: digest reference missing",
    );
  }
  return ["verify", ...identityFlags, digestRef];
}

async function assertFile(absPath: string, label: string): Promise<void> {
  try {
    await access(absPath, constants.R_OK);
    const info = await stat(absPath);
    if (!info.isFile()) {
      throw offlineSignatureFailure("(offline)", `offline cosign ${label} is not a file`);
    }
  } catch (error) {
    if (error instanceof SystemUpdateError) {
      throw error;
    }
    throw offlineSignatureFailure("(offline)", `offline cosign ${label} is missing`);
  }
}

async function assertDirectory(absPath: string, imageKey: string): Promise<void> {
  try {
    await access(absPath, constants.R_OK);
    const info = await stat(absPath);
    if (!info.isDirectory()) {
      throw offlineSignatureFailure(
        imageKey,
        `offline cosign local-image path for ${imageKey} is not a directory`,
      );
    }
  } catch (error) {
    if (error instanceof SystemUpdateError) {
      throw error;
    }
    throw offlineSignatureFailure(
      imageKey,
      `offline cosign local-image dir missing for ${imageKey}`,
    );
  }
}
