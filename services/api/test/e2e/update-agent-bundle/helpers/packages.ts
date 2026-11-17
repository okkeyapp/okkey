import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  generateUpdateKeyPair,
  signOfflinePackage,
  type OfflinePackagePayload,
} from "../../../../src/system-updates/package-format.ts";
import {
  CORE_IMAGE,
  CORE_SERVICES,
  CORE_TAG,
  ENTERPRISE_BAD_IMAGE,
  ENTERPRISE_IMAGE,
  ENTERPRISE_SERVICES,
  ENTERPRISE_TAG,
  REPO_ROOT,
} from "./constants.ts";
import { runOk } from "./shell.ts";

export type BundleKeys = {
  core: { publicKeyPem: string; privateKeyPem: string };
  enterprise: { publicKeyPem: string; privateKeyPem: string };
};

export function generateBundleKeys(): BundleKeys {
  return {
    core: generateUpdateKeyPair(),
    enterprise: generateUpdateKeyPair(),
  };
}

export function corePackage(
  privateKeyPem: string,
  overrides: Partial<OfflinePackagePayload> = {},
): Buffer {
  const payload: OfflinePackagePayload = {
    format: "okkey-offline-package",
    formatVersion: 1,
    component: "okkey",
    version: CORE_TAG,
    fromVersion: "1.0.0",
    summary: "E2E core package",
    releasedAt: "2026-11-17T00:00:00.000Z",
    imageTag: CORE_TAG,
    images: Object.fromEntries(CORE_SERVICES.map((service) => [service, CORE_IMAGE])),
    ...overrides,
  };
  return Buffer.from(JSON.stringify(signOfflinePackage(payload, privateKeyPem)), "utf8");
}

export function enterprisePackage(
  privateKeyPem: string,
  options?: { badHealth?: boolean; overrides?: Partial<OfflinePackagePayload> },
): Buffer {
  const image = options?.badHealth ? ENTERPRISE_BAD_IMAGE : ENTERPRISE_IMAGE;
  const payload: OfflinePackagePayload = {
    format: "okkey-offline-package",
    formatVersion: 1,
    component: "enterprise",
    version: ENTERPRISE_TAG,
    fromVersion: "1.0.0",
    summary: "E2E enterprise package",
    releasedAt: "2026-11-17T00:00:00.000Z",
    imageTag: ENTERPRISE_TAG,
    minCoreVersion: CORE_TAG,
    images: Object.fromEntries(ENTERPRISE_SERVICES.map((service) => [service, image])),
    ...(options?.overrides ?? {}),
  };
  return Buffer.from(JSON.stringify(signOfflinePackage(payload, privateKeyPem)), "utf8");
}

/** Pack with the release CLI so CI exercises the same path as a release job. */
export async function buildBundleWithCli(
  workDir: string,
  coreBytes: Buffer,
  enterpriseBytes: Buffer,
): Promise<unknown> {
  const packagesDir = path.join(workDir, "packages");
  mkdirSync(packagesDir, { recursive: true });
  const corePath = path.join(packagesDir, "core.okpkg");
  const enterprisePath = path.join(packagesDir, "enterprise.okpkg");
  const outPath = path.join(workDir, "okkey-offline.okbundle");
  writeFileSync(corePath, coreBytes);
  writeFileSync(enterprisePath, enterpriseBytes);
  await runOk("node", [
    "--experimental-strip-types",
    path.join(REPO_ROOT, "scripts/build-offline-bundle.mjs"),
    "--core",
    corePath,
    "--enterprise",
    enterprisePath,
    "--out",
    outPath,
  ]);
  return JSON.parse(readFileSync(outPath, "utf8")) as unknown;
}

export function tamperPackageSignature(packageBytes: Buffer): Buffer {
  const document = JSON.parse(packageBytes.toString("utf8")) as {
    payload: OfflinePackagePayload;
    signature: string;
  };
  const signature = Buffer.from(document.signature, "base64");
  signature[0] = signature[0]! ^ 0xff;
  document.signature = signature.toString("base64");
  return Buffer.from(JSON.stringify(document), "utf8");
}
