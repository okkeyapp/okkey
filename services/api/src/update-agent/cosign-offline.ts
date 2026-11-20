import { access, constants, stat } from "node:fs/promises";
import path from "node:path";

import { SystemUpdateError } from "../system-updates/errors.ts";
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

/**
 * Resolve offline material for an apply:
 * 1. `offlineMaterial` test hook (already absolute),
 * 2. else `cosignOfflineRoot` / `OKKEY_COSIGN_OFFLINE_DIR` + payload.cosignOffline
 *    or conventional paths when files exist.
 */
export async function resolveApplyCosignOfflineMaterial(input: {
  payload: OfflinePackagePayload;
  isolated: boolean;
  offlineMaterial?: CosignOfflineMaterial;
  cosignOfflineRoot?: string;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<CosignOfflineMaterial | undefined> {
  if (!input.isolated) {
    return undefined;
  }
  if (input.offlineMaterial) {
    await assertFile(input.offlineMaterial.trustedRootPath, "trusted_root");
    for (const [key, dir] of Object.entries(input.offlineMaterial.localImageDirs)) {
      await assertDirectory(dir, key);
    }
    return input.offlineMaterial;
  }
  const env = input.processEnv ?? process.env;
  const root = (input.cosignOfflineRoot ?? env.OKKEY_COSIGN_OFFLINE_DIR ?? "").trim();
  if (!root) {
    throw offlineSignatureFailure(
      "(offline)",
      "isolated mode requires OKKEY_COSIGN_OFFLINE_DIR or offline cosign material",
    );
  }
  return resolveCosignOfflineMaterial({
    payload: input.payload,
    materialRoot: root,
  });
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
