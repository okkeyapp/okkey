import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

import { SystemUpdateError } from "./errors.ts";
import { parseVersion } from "./versions.ts";

/** The only self-host update package format. Feed URLs and uploaded files both use it. */
export const OFFLINE_PACKAGE_FORMAT = "okkey-offline-package";
export const OFFLINE_PACKAGE_FORMAT_VERSION = 1;
export const UPDATE_FEED_SCHEMA = "okkey.update-feed.v1";

export const UPDATE_COMPONENTS = ["okkey", "enterprise"] as const;
export type UpdateComponent = (typeof UPDATE_COMPONENTS)[number];

export const CORE_IMAGE_SERVICES = ["api", "web", "worker"] as const;

/** Compose service names for the enterprise api, web, and worker images. */
export const ENTERPRISE_IMAGE_SERVICES = ["enterprise-api", "enterprise-web", "enterprise-worker"] as const;

/**
 * Short-lived read-only registry credentials from an update feed.
 * They are not part of the signed package and must not be written to disk.
 */
export type RegistryPullCredentials = {
  server: string;
  username: string;
  password: string;
};

export type OfflinePackagePayload = {
  format: typeof OFFLINE_PACKAGE_FORMAT;
  formatVersion: typeof OFFLINE_PACKAGE_FORMAT_VERSION;
  component: UpdateComponent;
  version: string;
  fromVersion: string;
  summary: string;
  releasedAt: string;
  imageTag: string;
  images: Record<string, string>;
  /** Required on enterprise packages. Compared with the running core before any change. */
  minCoreVersion?: string;
};

export type SignedOfflinePackage = {
  payload: OfflinePackagePayload;
  signature: string;
};

export type UpdateFeedPackage = {
  component: UpdateComponent;
  version: string;
  fromVersion: string;
  summary: string;
  releasedAt: string;
  packageUrl: string;
  packageSha256: string;
  registryCredentials?: RegistryPullCredentials;
};

export type UpdateFeedDocument = {
  schema: typeof UPDATE_FEED_SCHEMA;
  packages: UpdateFeedPackage[];
  registryCredentials?: RegistryPullCredentials;
};

const SUMMARY_MAX = 280;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry === undefined) {
        continue;
      }
      sorted[key] = sortValue(entry);
    }
    return sorted;
  }
  return value;
}

export function normalizePublicKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const withBreaks = trimmed.replace(/\\n/g, "\n");
  if (withBreaks.includes("BEGIN PUBLIC KEY")) {
    return withBreaks;
  }
  const compact = withBreaks.replace(/\s+/g, "");
  const lines = compact.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

export function generateUpdateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signOfflinePackage(
  payload: OfflinePackagePayload,
  privateKeyPem: string,
): SignedOfflinePackage {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonicalJson(payload), "utf8"), key);
  return {
    payload,
    signature: signature.toString("base64"),
  };
}

export type VerifiedPackage = {
  payload: OfflinePackagePayload;
};

/**
 * Verify an offline package. Missing key, missing signature, or a failed check
 * throws and must not be followed by an apply.
 */
export function verifyOfflinePackage(document: unknown, publicKeyPem: string): VerifiedPackage {
  const envelope = asRecord(document);
  if (!envelope) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package must be a JSON object");
  }
  const signature = typeof envelope.signature === "string" ? envelope.signature.trim() : "";
  if (!signature) {
    throw new SystemUpdateError(
      400,
      "SIGNATURE_MISSING",
      "Package has no signature and was not applied",
    );
  }
  const trusted = normalizePublicKey(publicKeyPem);
  if (!trusted) {
    throw new SystemUpdateError(
      400,
      "TRUST_KEY_MISSING",
      "No trusted public key is configured, so the package was not applied",
    );
  }

  let publicKey: KeyObject;
  let signatureBytes: Buffer;
  try {
    publicKey = createPublicKey(trusted);
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    throw new SystemUpdateError(
      400,
      "SIGNATURE_INVALID",
      "Package signature could not be checked and was not applied",
    );
  }
  if (signatureBytes.length === 0) {
    throw new SystemUpdateError(
      400,
      "SIGNATURE_MISSING",
      "Package has no signature and was not applied",
    );
  }

  const payload = envelope.payload;
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson(payload), "utf8"),
      publicKey,
      signatureBytes,
    );
  } catch {
    throw new SystemUpdateError(
      400,
      "VERIFICATION_INTERRUPTED",
      "Package verification was interrupted and was not applied",
    );
  }
  if (!valid) {
    throw new SystemUpdateError(
      400,
      "SIGNATURE_INVALID",
      "Package signature is invalid and was not applied",
    );
  }

  return { payload: parsePayload(payload) };
}

export function parsePayload(value: unknown): OfflinePackagePayload {
  const record = asRecord(value);
  if (!record) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package payload is missing");
  }
  if (record.format !== OFFLINE_PACKAGE_FORMAT || record.formatVersion !== OFFLINE_PACKAGE_FORMAT_VERSION) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Unsupported offline package format");
  }
  const component = record.component;
  if (component !== "okkey" && component !== "enterprise") {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Unknown package component");
  }
  const version = requiredText(record.version, "version");
  const fromVersion = requiredText(record.fromVersion, "fromVersion");
  const summary = requiredText(record.summary, "summary").slice(0, SUMMARY_MAX);
  const releasedAt = requiredText(record.releasedAt, "releasedAt");
  const imageTag = requiredText(record.imageTag, "imageTag");
  const images = parseImages(record.images);
  const minCoreVersion = parseMinCoreVersion(record.minCoreVersion);
  if (component === "okkey") {
    for (const service of CORE_IMAGE_SERVICES) {
      if (!images[service]) {
        throw new SystemUpdateError(
          400,
          "PACKAGE_INVALID",
          `Core package is missing the ${service} image`,
        );
      }
    }
  }
  if (component === "enterprise") {
    if (!minCoreVersion) {
      throw new SystemUpdateError(
        400,
        "PACKAGE_INVALID",
        "Enterprise package is missing minCoreVersion",
      );
    }
    for (const service of ENTERPRISE_IMAGE_SERVICES) {
      if (!images[service]) {
        throw new SystemUpdateError(
          400,
          "PACKAGE_INVALID",
          `Enterprise package is missing the ${service} image`,
        );
      }
    }
  }
  if (Object.keys(images).length === 0) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package does not list any images");
  }
  return {
    format: OFFLINE_PACKAGE_FORMAT,
    formatVersion: OFFLINE_PACKAGE_FORMAT_VERSION,
    component,
    version,
    fromVersion,
    summary,
    releasedAt,
    imageTag,
    images,
    ...(minCoreVersion ? { minCoreVersion } : {}),
  };
}

/** Component named by the package, before the signature is trusted. */
export function claimedPackageComponent(document: unknown): UpdateComponent | null {
  const envelope = asRecord(document);
  const payload = asRecord(envelope?.payload);
  const component = payload?.component;
  if (component === "okkey" || component === "enterprise") {
    return component;
  }
  return null;
}

/**
 * Read feed or apply-request registry credentials.
 * Error text never includes the username, password, or server value.
 */
export function readRegistryCredentials(
  value: unknown,
  code: "FEED_INVALID" | "PACKAGE_INVALID",
): RegistryPullCredentials | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const record = asRecord(value);
  if (!record) {
    throw new SystemUpdateError(400, code, "Registry credentials must be an object");
  }
  const server = normalizeRegistryServer(record.server);
  const username = typeof record.username === "string" ? record.username.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (
    !server ||
    !username ||
    username.length > 256 ||
    !password.trim() ||
    password.length > 4096 ||
    username.includes("\n") ||
    username.includes("\r") ||
    password.includes("\n") ||
    password.includes("\r")
  ) {
    throw new SystemUpdateError(400, code, "Registry credentials are incomplete");
  }
  return { server, username, password };
}

/** Remove registry credentials from an apply request so later steps cannot persist them. */
export function takeRegistryCredentials(document: unknown): RegistryPullCredentials | undefined {
  const record = asRecord(document);
  if (!record || !Object.prototype.hasOwnProperty.call(record, "registryCredentials")) {
    return undefined;
  }
  const raw = record.registryCredentials;
  delete record.registryCredentials;
  return readRegistryCredentials(raw, "PACKAGE_INVALID");
}

export function parseUpdateFeed(value: unknown): UpdateFeedDocument {
  const record = asRecord(value);
  if (!record || record.schema !== UPDATE_FEED_SCHEMA || !Array.isArray(record.packages)) {
    throw new SystemUpdateError(400, "FEED_INVALID", "Update feed schema is not okkey.update-feed.v1");
  }
  const packages: UpdateFeedPackage[] = [];
  for (const entry of record.packages) {
    const item = asRecord(entry);
    if (!item) {
      throw new SystemUpdateError(400, "FEED_INVALID", "Update feed package is not an object");
    }
    const component = item.component;
    if (component !== "okkey" && component !== "enterprise") {
      throw new SystemUpdateError(400, "FEED_INVALID", "Update feed component is unknown");
    }
    const registryCredentials = readRegistryCredentials(item.registryCredentials, "FEED_INVALID");
    packages.push({
      component,
      version: requiredText(item.version, "version"),
      fromVersion: requiredText(item.fromVersion, "fromVersion"),
      summary: requiredText(item.summary, "summary").slice(0, SUMMARY_MAX),
      releasedAt: requiredText(item.releasedAt, "releasedAt"),
      packageUrl: requiredHttpUrl(item.packageUrl),
      packageSha256: requiredSha256(item.packageSha256),
      ...(registryCredentials ? { registryCredentials } : {}),
    });
  }
  const registryCredentials = readRegistryCredentials(record.registryCredentials, "FEED_INVALID");
  return {
    schema: UPDATE_FEED_SCHEMA,
    packages,
    ...(registryCredentials ? { registryCredentials } : {}),
  };
}

export function assertHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SystemUpdateError(400, "FEED_INVALID", "Update URL must be an absolute http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SystemUpdateError(400, "FEED_INVALID", "Update URL must use http or https");
  }
  if (url.username || url.password) {
    throw new SystemUpdateError(400, "FEED_INVALID", "Update URL must not include credentials");
  }
  return url;
}

function requiredHttpUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new SystemUpdateError(400, "FEED_INVALID", "packageUrl is required");
  }
  return assertHttpUrl(value).toString();
}

function requiredSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new SystemUpdateError(400, "FEED_INVALID", "packageSha256 must be 64 hex characters");
  }
  return value.toLowerCase();
}

function parseImages(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package images are missing");
  }
  const images: Record<string, string> = {};
  for (const [service, image] of Object.entries(record)) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(service)) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package image service name is invalid");
    }
    if (typeof image !== "string" || image.trim() === "" || image.length > 300) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package image reference is invalid");
    }
    images[service] = image.trim();
  }
  return images;
}

function parseMinCoreVersion(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !parseVersion(value.trim())) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "minCoreVersion must be a semantic version");
  }
  return value.trim();
}

function normalizeRegistryServer(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const server = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/.test(server)) {
    return "";
  }
  return server;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", `${field} is required`);
  }
  return value.trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
