import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Digests read from a `cosign save` OCI layout directory (TSK-317).
 * `configDigest` is what Docker reports as image Id after load.
 * `manifestDigest` is the OCI/Docker manifest digest (RepoDigests).
 */
export type OciImageDigests = {
  configDigest: string;
  manifestDigest: string;
};

type OciDescriptor = {
  mediaType?: string;
  digest?: string;
  size?: number;
  platform?: { architecture?: string; os?: string; variant?: string };
};

type OciIndex = {
  schemaVersion?: number;
  mediaType?: string;
  manifests?: OciDescriptor[];
};

type OciManifest = {
  schemaVersion?: number;
  mediaType?: string;
  config?: OciDescriptor;
  manifests?: OciDescriptor[];
};

const IMAGE_INDEX_TYPES = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
]);

const IMAGE_MANIFEST_TYPES = new Set([
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
]);

/**
 * Read config + manifest digests from a cosign-save / OCI layout directory.
 * Picks the best matching linux/<arch> platform when the layout is multi-arch.
 * Fail closed: throws Error when the layout is missing or incomplete.
 */
export async function readOciLayoutImageDigests(
  layoutDir: string,
  options?: { architecture?: string; os?: string },
): Promise<OciImageDigests> {
  const root = path.resolve(layoutDir);
  const index = await readJsonFile<OciIndex>(path.join(root, "index.json"));
  const manifests = Array.isArray(index.manifests) ? index.manifests : [];
  if (manifests.length === 0) {
    throw new Error("OCI layout index.json has no manifests");
  }

  const wantOs = (options?.os ?? "linux").toLowerCase();
  const wantArch = (options?.architecture ?? process.arch).toLowerCase();
  const archAliases = architectureAliases(wantArch);

  const descriptor = pickManifestDescriptor(manifests, wantOs, archAliases);
  if (!descriptor?.digest) {
    throw new Error("OCI layout has no suitable platform manifest");
  }

  return readManifestDigests(root, descriptor);
}

async function readManifestDigests(
  layoutRoot: string,
  descriptor: OciDescriptor,
): Promise<OciImageDigests> {
  const mediaType = (descriptor.mediaType ?? "").trim();
  const digest = normalizeDigest(descriptor.digest ?? "");
  if (!digest) {
    throw new Error("OCI manifest descriptor digest is missing");
  }

  const blob = await readBlob(layoutRoot, digest);
  const parsed = JSON.parse(blob.toString("utf8")) as OciManifest;

  if (IMAGE_INDEX_TYPES.has(mediaType) || Array.isArray(parsed.manifests)) {
    const nested = Array.isArray(parsed.manifests) ? parsed.manifests : [];
    const wantArch = architectureAliases(process.arch);
    const child = pickManifestDescriptor(nested, "linux", wantArch);
    if (!child?.digest) {
      throw new Error("OCI image index has no platform manifest");
    }
    return readManifestDigests(layoutRoot, child);
  }

  if (!IMAGE_MANIFEST_TYPES.has(mediaType) && !parsed.config) {
    throw new Error(`unsupported OCI mediaType: ${mediaType || "(empty)"}`);
  }

  const configDigest = normalizeDigest(parsed.config?.digest ?? "");
  if (!configDigest) {
    throw new Error("OCI image manifest has no config digest");
  }
  return {
    configDigest,
    manifestDigest: digest,
  };
}

function pickManifestDescriptor(
  manifests: OciDescriptor[],
  wantOs: string,
  archAliases: Set<string>,
): OciDescriptor | null {
  const exact = manifests.find((entry) => {
    const os = (entry.platform?.os ?? "").toLowerCase();
    const arch = (entry.platform?.architecture ?? "").toLowerCase();
    return os === wantOs && archAliases.has(arch);
  });
  if (exact) {
    return exact;
  }
  // Single-manifest layouts often omit platform.
  if (manifests.length === 1) {
    return manifests[0] ?? null;
  }
  const noPlatform = manifests.filter((entry) => !entry.platform);
  if (noPlatform.length === 1) {
    return noPlatform[0] ?? null;
  }
  return null;
}

function architectureAliases(arch: string): Set<string> {
  const normalized = arch.toLowerCase();
  if (normalized === "x64" || normalized === "x86_64" || normalized === "amd64") {
    return new Set(["amd64", "x86_64", "x64"]);
  }
  if (normalized === "arm64" || normalized === "aarch64") {
    return new Set(["arm64", "aarch64"]);
  }
  return new Set([normalized]);
}

async function readBlob(layoutRoot: string, digest: string): Promise<Buffer> {
  const hex = digest.slice("sha256:".length);
  const blobPath = path.join(layoutRoot, "blobs", "sha256", hex);
  try {
    return await readFile(blobPath);
  } catch {
    throw new Error(`OCI blob missing for ${digest}`);
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`OCI layout file missing or invalid: ${path.basename(filePath)}`);
  }
}

/** Normalize to lowercase `sha256:<64 hex>` or empty string. */
export function normalizeDigest(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("sha256:")) {
    const hex = trimmed.slice("sha256:".length).toLowerCase();
    return /^[a-f0-9]{64}$/.test(hex) ? `sha256:${hex}` : "";
  }
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return `sha256:${trimmed.toLowerCase()}`;
  }
  return "";
}

/**
 * Test helper: write a minimal single-platform OCI layout whose config digest
 * is `configDigest` and manifest digest is returned for assertions.
 */
export async function writeMinimalOciLayout(
  layoutDir: string,
  input: { configDigest: string; architecture?: string },
): Promise<{ configDigest: string; manifestDigest: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const configDigest = normalizeDigest(input.configDigest);
  if (!configDigest) {
    throw new Error("configDigest required");
  }
  const configHex = configDigest.slice("sha256:".length);
  const configJson = `${JSON.stringify({
    architecture: input.architecture ?? "amd64",
    os: "linux",
    rootfs: { type: "layers", diff_ids: [] },
  })}\n`;
  // Use a fixed config blob only when its sha256 matches the requested digest;
  // otherwise write a placeholder file named for the digest (tests control the Id).
  const blobsDir = path.join(layoutDir, "blobs", "sha256");
  await mkdir(blobsDir, { recursive: true });
  await writeFile(path.join(blobsDir, configHex), configJson);

  const manifestJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: configDigest,
      size: Buffer.byteLength(configJson),
    },
    layers: [],
  })}\n`;
  const manifestDigest = `sha256:${createHash("sha256").update(manifestJson).digest("hex")}`;
  const manifestHex = manifestDigest.slice("sha256:".length);
  await writeFile(path.join(blobsDir, manifestHex), manifestJson);

  const indexJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: manifestDigest,
        size: Buffer.byteLength(manifestJson),
        platform: {
          architecture: input.architecture ?? "amd64",
          os: "linux",
        },
      },
    ],
  })}\n`;
  await writeFile(path.join(layoutDir, "index.json"), indexJson);
  await writeFile(path.join(layoutDir, "oci-layout"), JSON.stringify({ imageLayoutVersion: "1.0.0" }));
  return { configDigest, manifestDigest };
}
