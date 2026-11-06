import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

import { SystemUpdateError } from "./errors.ts";

/** The only self-host update package format. Feed URLs and uploaded files both use it. */
export const OFFLINE_PACKAGE_FORMAT = "okkey-offline-package";
export const OFFLINE_PACKAGE_FORMAT_VERSION = 1;
export const UPDATE_FEED_SCHEMA = "okkey.update-feed.v1";

export const UPDATE_COMPONENTS = ["okkey", "enterprise"] as const;
export type UpdateComponent = (typeof UPDATE_COMPONENTS)[number];

export const CORE_IMAGE_SERVICES = ["api", "web", "worker"] as const;

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
};

export type UpdateFeedDocument = {
  schema: typeof UPDATE_FEED_SCHEMA;
  packages: UpdateFeedPackage[];
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
  };
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
    packages.push({
      component,
      version: requiredText(item.version, "version"),
      fromVersion: requiredText(item.fromVersion, "fromVersion"),
      summary: requiredText(item.summary, "summary").slice(0, SUMMARY_MAX),
      releasedAt: requiredText(item.releasedAt, "releasedAt"),
      packageUrl: requiredHttpUrl(item.packageUrl),
      packageSha256: requiredSha256(item.packageSha256),
    });
  }
  return { schema: UPDATE_FEED_SCHEMA, packages };
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
