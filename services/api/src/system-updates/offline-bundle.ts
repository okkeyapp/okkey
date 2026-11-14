import { createHash, timingSafeEqual } from "node:crypto";
import { inflateRawSync, deflateRawSync } from "node:zlib";

import { SystemUpdateError } from "./errors.ts";
import {
  verifyOfflinePackage,
  type OfflinePackagePayload,
  type UpdateComponent,
} from "./package-format.ts";
import { coreSatisfiesMinimum } from "./versions.ts";

/** One air-gap archive for a release. The zip carries the manifest and both signed packages. */
export const OFFLINE_BUNDLE_FORMAT = "okkey-offline-bundle";
export const OFFLINE_BUNDLE_FORMAT_VERSION = 1;

export const BUNDLE_MANIFEST_PATH = "manifest.json";
export const BUNDLE_CORE_PATH = "packages/okkey.okpkg";
export const BUNDLE_ENTERPRISE_PATH = "packages/enterprise.okpkg";

const APPLY_ORDER = ["okkey", "enterprise"] as const;

/** Compressed zip, and the JSON body that carries it, stay under this size. */
export const BUNDLE_MAX_ARCHIVE_BYTES = 1_000_000;
export const BUNDLE_MAX_ENTRIES = 8;
export const BUNDLE_MAX_UNCOMPRESSED_ENTRY = 1_000_000;
export const BUNDLE_MAX_UNCOMPRESSED_TOTAL = 2_000_000;
const BUNDLE_MAX_NAME_BYTES = 128;
const BUNDLE_RATIO_FLOOR = 64 * 1024;
const BUNDLE_MAX_RATIO = 100;

export type OfflineBundleDocument = {
  format: typeof OFFLINE_BUNDLE_FORMAT;
  formatVersion: typeof OFFLINE_BUNDLE_FORMAT_VERSION;
  archiveBase64: string;
};

export type BuiltOfflineBundle = {
  zip: Buffer;
  document: OfflineBundleDocument;
};

export type VerifiedOfflineBundle = {
  core: OfflinePackagePayload;
  enterprise: OfflinePackagePayload;
};

type ZipEntry = {
  name: string;
  data: Buffer;
};

/**
 * Pack the raw signed package files. Hashes cover those bytes, not a re-encoding.
 * `okkey` is the core component and is listed first.
 */
export function buildOfflineBundle(corePackage: Buffer, enterprisePackage: Buffer): BuiltOfflineBundle {
  const manifest = {
    format: OFFLINE_BUNDLE_FORMAT,
    formatVersion: OFFLINE_BUNDLE_FORMAT_VERSION,
    applyOrder: [...APPLY_ORDER],
    packages: [
      { component: "okkey", path: BUNDLE_CORE_PATH, sha256: sha256Hex(corePackage) },
      { component: "enterprise", path: BUNDLE_ENTERPRISE_PATH, sha256: sha256Hex(enterprisePackage) },
    ],
  };
  const zip = writeZip([
    { name: BUNDLE_MANIFEST_PATH, data: Buffer.from(JSON.stringify(manifest), "utf8") },
    { name: BUNDLE_CORE_PATH, data: corePackage },
    { name: BUNDLE_ENTERPRISE_PATH, data: enterprisePackage },
  ]);
  if (zip.length > BUNDLE_MAX_ARCHIVE_BYTES) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle exceeds the size limit");
  }
  return {
    zip,
    document: {
      format: OFFLINE_BUNDLE_FORMAT,
      formatVersion: OFFLINE_BUNDLE_FORMAT_VERSION,
      archiveBase64: zip.toString("base64"),
    },
  };
}

export function isOfflineBundleDocument(document: unknown): boolean {
  const record = asRecord(document);
  return record?.format === OFFLINE_BUNDLE_FORMAT;
}

/**
 * Check the archive before any install change.
 * Each inner package is verified with its own key. A hash, order, path, or
 * component mismatch rejects the whole archive.
 */
export function verifyOfflineBundle(
  document: unknown,
  keys: { corePublicKeyPem: string; enterprisePublicKeyPem: string },
): VerifiedOfflineBundle {
  const entries = readBundleEntries(document);
  const manifestBytes = entries.get(BUNDLE_MANIFEST_PATH);
  const coreBytes = entries.get(BUNDLE_CORE_PATH);
  const enterpriseBytes = entries.get(BUNDLE_ENTERPRISE_PATH);
  if (!manifestBytes || !coreBytes || !enterpriseBytes) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle is missing a required file");
  }

  const manifest = parseManifest(manifestBytes);
  if (
    manifest.applyOrder.length !== APPLY_ORDER.length ||
    manifest.applyOrder.some((component, index) => component !== APPLY_ORDER[index])
  ) {
    throw new SystemUpdateError(
      400,
      "PACKAGE_INVALID",
      "Offline bundle apply order must be core, then enterprise",
    );
  }
  assertManifestPackage(manifest, "okkey", BUNDLE_CORE_PATH, coreBytes);
  assertManifestPackage(manifest, "enterprise", BUNDLE_ENTERPRISE_PATH, enterpriseBytes);

  const core = verifyInnerPackage(coreBytes, "okkey", keys.corePublicKeyPem);
  const enterprise = verifyInnerPackage(enterpriseBytes, "enterprise", keys.enterprisePublicKeyPem);
  const minimum = enterprise.minCoreVersion ?? "";
  if (!minimum || !coreSatisfiesMinimum(core.version, minimum)) {
    throw new SystemUpdateError(
      409,
      "CORE_UPDATE_REQUIRED",
      `Update core first. This enterprise package requires core ${minimum || "a newer core"} or newer. The bundled core is ${core.version}. Nothing was changed`,
    );
  }
  return { core, enterprise };
}

function verifyInnerPackage(
  bytes: Buffer,
  expected: UpdateComponent,
  publicKeyPem: string,
): OfflinePackagePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle package is not JSON");
  }
  const payload = verifyOfflinePackage(parsed, publicKeyPem).payload;
  if (payload.component !== expected) {
    throw new SystemUpdateError(
      400,
      "PACKAGE_INVALID",
      "Offline bundle package does not match its manifest entry",
    );
  }
  return payload;
}

type ManifestPackage = {
  component: UpdateComponent;
  path: string;
  sha256: string;
};

type BundleManifest = {
  applyOrder: string[];
  packages: ManifestPackage[];
};

function parseManifest(bytes: Buffer): BundleManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle manifest is not JSON");
  }
  const record = asRecord(parsed);
  if (!record || record.format !== OFFLINE_BUNDLE_FORMAT || record.formatVersion !== OFFLINE_BUNDLE_FORMAT_VERSION) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle manifest format is not supported");
  }
  if (!Array.isArray(record.applyOrder) || !Array.isArray(record.packages)) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle manifest is incomplete");
  }
  if (record.packages.length !== APPLY_ORDER.length || record.applyOrder.length !== APPLY_ORDER.length) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle must contain core and enterprise only");
  }
  const packages: ManifestPackage[] = [];
  for (const entry of record.packages) {
    const item = asRecord(entry);
    const component = item?.component;
    const path = item?.path;
    const sha256 = item?.sha256;
    if (component !== "okkey" && component !== "enterprise") {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle manifest has an unknown component");
    }
    if (typeof path !== "string" || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle manifest entry is invalid");
    }
    packages.push({ component, path, sha256 });
  }
  return {
    applyOrder: record.applyOrder.map((entry) => (typeof entry === "string" ? entry : "")),
    packages,
  };
}

function assertManifestPackage(
  manifest: BundleManifest,
  component: UpdateComponent,
  path: string,
  bytes: Buffer,
): void {
  const matches = manifest.packages.filter((entry) => entry.component === component);
  if (matches.length !== 1) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle manifest component is missing");
  }
  const entry = matches[0];
  if (!entry || entry.path !== path) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle manifest path does not match the component");
  }
  const actual = sha256Hex(bytes);
  if (!hashesEqual(actual, entry.sha256)) {
    throw new SystemUpdateError(
      400,
      "PACKAGE_INVALID",
      "Offline bundle package does not match the manifest hash",
    );
  }
}

function readBundleEntries(document: unknown): Map<string, Buffer> {
  const zip = zipBytesFromDocument(document);
  const entries = readZip(zip);
  const allowed = new Set<string>([BUNDLE_MANIFEST_PATH, BUNDLE_CORE_PATH, BUNDLE_ENTERPRISE_PATH]);
  for (const name of entries.keys()) {
    if (!allowed.has(name)) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle contains an unknown entry");
    }
  }
  return entries;
}

function zipBytesFromDocument(document: unknown): Buffer {
  if (Buffer.isBuffer(document)) {
    return assertZipSize(document);
  }
  const record = asRecord(document);
  if (!record || record.format !== OFFLINE_BUNDLE_FORMAT) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle format is not supported");
  }
  if (record.formatVersion !== OFFLINE_BUNDLE_FORMAT_VERSION) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle format version is not supported");
  }
  const encoded = record.archiveBase64;
  if (typeof encoded !== "string" || encoded.trim() === "") {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle is missing archiveBase64");
  }
  const compact = encoded.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle archive is not valid base64");
  }
  return assertZipSize(Buffer.from(compact, "base64"));
}

function assertZipSize(zip: Buffer): Buffer {
  if (zip.length === 0 || zip.length > BUNDLE_MAX_ARCHIVE_BYTES) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle exceeds the size limit");
  }
  return zip;
}

export function writeZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length === 0 || entries.length > BUNDLE_MAX_ENTRIES) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry count is not allowed");
  }
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    if (name.length === 0 || name.length > BUNDLE_MAX_NAME_BYTES) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry name is invalid");
    }
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function readZip(zip: Buffer): Map<string, Buffer> {
  const eocd = findEocd(zip);
  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt16LE(eocd + 4) !== 0 || zip.readUInt16LE(eocd + 6) !== 0) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle spans more than one archive");
  }
  if (entryCount > BUNDLE_MAX_ENTRIES) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle contains too many entries");
  }
  if (centralOffset + centralSize > eocd) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle directory is out of range");
  }

  const names = new Map<string, Buffer>();
  const ranges: Array<[number, number]> = [];
  let cursor = centralOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralOffset + centralSize) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle directory is truncated");
    }
    if (zip.readUInt32LE(cursor) !== 0x02014b50) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle directory is invalid");
    }
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const crc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > centralOffset + centralSize) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle directory is truncated");
    }
    const name = assertEntryName(zip.subarray(nameStart, nameEnd).toString("utf8"));
    if (names.has(name)) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle contains a duplicate entry");
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0008) !== 0 || (flags & 0x0040) !== 0) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry cannot be read");
    }
    if (method !== 0 && method !== 8) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry compression is not supported");
    }
    if (
      compressedSize > BUNDLE_MAX_ARCHIVE_BYTES ||
      uncompressedSize > BUNDLE_MAX_UNCOMPRESSED_ENTRY ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff
    ) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry exceeds the size limit");
    }
    if (
      uncompressedSize > BUNDLE_RATIO_FLOOR &&
      uncompressedSize / Math.max(compressedSize, 1) > BUNDLE_MAX_RATIO
    ) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry expands too far for its compressed size");
    }
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > BUNDLE_MAX_UNCOMPRESSED_TOTAL) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle expands past the size limit");
    }

    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry header is invalid");
    }
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry is out of range");
    }
    const localName = zip.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    if (
      localName !== name ||
      zip.readUInt32LE(localOffset + 14) !== crc ||
      zip.readUInt32LE(localOffset + 18) !== compressedSize ||
      zip.readUInt32LE(localOffset + 22) !== uncompressedSize
    ) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry header does not match the directory");
    }
    for (const range of ranges) {
      if (localOffset < range[1] && dataEnd > range[0]) {
        throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entries overlap");
      }
    }
    ranges.push([localOffset, dataEnd]);

    const compressed = zip.subarray(dataStart, dataEnd);
    const data = inflateEntry(method, compressed, uncompressedSize);
    if (crc32(data) !== crc) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry checksum does not match");
    }
    names.set(name, data);
    cursor = nameEnd + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle directory has trailing data");
  }
  return names;
}

function inflateEntry(method: number, compressed: Buffer, uncompressedSize: number): Buffer {
  if (method === 0) {
    if (compressed.length !== uncompressedSize) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry size does not match");
    }
    return Buffer.from(compressed);
  }
  try {
    const data = inflateRawSync(compressed, { maxOutputLength: uncompressedSize });
    if (data.length !== uncompressedSize) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry size does not match");
    }
    return data;
  } catch (error) {
    if (error instanceof SystemUpdateError) {
      throw error;
    }
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry could not be read");
  }
}

function findEocd(zip: Buffer): number {
  const min = Math.max(0, zip.length - 22 - 65535);
  for (let offset = zip.length - 22; offset >= min; offset -= 1) {
    if (zip.readUInt32LE(offset) !== 0x06054b50) {
      continue;
    }
    const commentLength = zip.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === zip.length) {
      return offset;
    }
  }
  throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle is not a zip archive");
}

/**
 * Reject names that would escape an extract directory.
 * The reader never writes entries to disk; the name is still checked first.
 */
export function assertEntryName(name: string): string {
  if (name.length === 0 || name.length > BUNDLE_MAX_NAME_BYTES) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry name is invalid");
  }
  if (name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry path is not allowed");
  }
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Offline bundle entry path is not allowed");
  }
  return name;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashesEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== 32 || right.length !== 32) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Buffer.isBuffer(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
  }
  CRC_TABLE[index] = crc >>> 0;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    const tableValue = CRC_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = (tableValue ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
