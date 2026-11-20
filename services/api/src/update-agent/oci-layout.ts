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
  artifactType?: string;
  platform?: { architecture?: string; os?: string; variant?: string };
  annotations?: Record<string, string>;
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
  layers?: OciDescriptor[];
};

const IMAGE_INDEX_TYPES = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
]);

const IMAGE_MANIFEST_TYPES = new Set([
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
]);

const SIGNATURE_MEDIA_HINTS = [
  "cosign",
  "simplesigning",
  "in-toto",
  "dsse",
  "sigstore",
  "application/vnd.cncf.notary",
];

/**
 * Read config + manifest digests from a cosign-save / OCI layout directory.
 * Handles real `cosign save` roots (image index + signature descriptors without
 * platform), follows nested image indexes, and ignores sig/attestation entries.
 * Every blob is sha256-verified against its digest (fail closed).
 */
export async function readOciLayoutImageDigests(
  layoutDir: string,
  options?: { architecture?: string; os?: string },
): Promise<OciImageDigests> {
  const root = path.resolve(layoutDir);
  const indexRaw = await readFileVerified(
    path.join(root, "index.json"),
    /* expectedDigest */ null,
  );
  const index = parseJson<OciIndex>(indexRaw, "index.json");
  const manifests = Array.isArray(index.manifests) ? index.manifests : [];
  if (manifests.length === 0) {
    throw new Error("OCI layout index.json has no manifests");
  }

  const wantOs = (options?.os ?? "linux").toLowerCase();
  const wantArch = (options?.architecture ?? process.arch).toLowerCase();
  const archAliases = architectureAliases(wantArch);

  const descriptor = pickImageDescriptor(manifests, wantOs, archAliases);
  if (!descriptor?.digest) {
    throw new Error("OCI layout has no suitable platform manifest");
  }

  return readManifestDigests(root, descriptor, wantOs, archAliases);
}

async function readManifestDigests(
  layoutRoot: string,
  descriptor: OciDescriptor,
  wantOs: string,
  archAliases: Set<string>,
): Promise<OciImageDigests> {
  const mediaType = (descriptor.mediaType ?? "").trim();
  const digest = normalizeDigest(descriptor.digest ?? "");
  if (!digest) {
    throw new Error("OCI manifest descriptor digest is missing");
  }
  if (isSignatureOrAttestationDescriptor(descriptor)) {
    throw new Error("OCI signature/attestation descriptor is not an image manifest");
  }

  const blob = await readBlobVerified(layoutRoot, digest);
  const parsed = parseJson<OciManifest>(blob, digest);

  if (IMAGE_INDEX_TYPES.has(mediaType) || Array.isArray(parsed.manifests)) {
    const nested = Array.isArray(parsed.manifests) ? parsed.manifests : [];
    const child = pickImageDescriptor(nested, wantOs, archAliases);
    if (!child?.digest) {
      throw new Error("OCI image index has no platform manifest");
    }
    return readManifestDigests(layoutRoot, child, wantOs, archAliases);
  }

  if (!IMAGE_MANIFEST_TYPES.has(mediaType) && !parsed.config) {
    throw new Error(`unsupported OCI mediaType: ${mediaType || "(empty)"}`);
  }

  const configDigest = normalizeDigest(parsed.config?.digest ?? "");
  if (!configDigest) {
    throw new Error("OCI image manifest has no config digest");
  }
  // Verify the config blob matches its digest (blocks renamed/tampered configs).
  await readBlobVerified(layoutRoot, configDigest);

  return {
    configDigest,
    manifestDigest: digest,
  };
}

/**
 * Prefer a linux/<arch> image manifest; otherwise follow a nested image index.
 * Skip cosign signature / attestation descriptors (typical second index entry).
 */
function pickImageDescriptor(
  manifests: OciDescriptor[],
  wantOs: string,
  archAliases: Set<string>,
): OciDescriptor | null {
  const candidates = manifests.filter((entry) => !isSignatureOrAttestationDescriptor(entry));
  if (candidates.length === 0) {
    return null;
  }

  const exact = candidates.find((entry) => {
    const os = (entry.platform?.os ?? "").toLowerCase();
    const arch = (entry.platform?.architecture ?? "").toLowerCase();
    return os === wantOs && archAliases.has(arch);
  });
  if (exact) {
    return exact;
  }

  // Real `cosign save` root index: image index (no platform) + sigs (no platform).
  const nestedIndexes = candidates.filter((entry) => {
    const media = (entry.mediaType ?? "").trim();
    return IMAGE_INDEX_TYPES.has(media);
  });
  if (nestedIndexes.length === 1) {
    return nestedIndexes[0] ?? null;
  }
  if (nestedIndexes.length > 1) {
    // Prefer the one without cosign annotations (already filtered) — take first.
    return nestedIndexes[0] ?? null;
  }

  const imageManifests = candidates.filter((entry) => {
    const media = (entry.mediaType ?? "").trim();
    return IMAGE_MANIFEST_TYPES.has(media) || !media;
  });
  if (imageManifests.length === 1) {
    return imageManifests[0] ?? null;
  }

  const noPlatform = imageManifests.filter((entry) => !entry.platform);
  if (noPlatform.length === 1) {
    return noPlatform[0] ?? null;
  }
  return null;
}

/** True for cosign signature / attestation descriptors in a `cosign save` index. */
export function isSignatureOrAttestationDescriptor(entry: OciDescriptor): boolean {
  const media = (entry.mediaType ?? "").toLowerCase();
  const artifact = (entry.artifactType ?? "").toLowerCase();
  for (const hint of SIGNATURE_MEDIA_HINTS) {
    if (media.includes(hint) || artifact.includes(hint)) {
      return true;
    }
  }
  const annotations = entry.annotations ?? {};
  for (const key of Object.keys(annotations)) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith("dev.cosignproject.cosign/") ||
      lower.includes("sigstore") ||
      lower.endsWith("/signature") ||
      lower.endsWith("/attestation")
    ) {
      return true;
    }
  }
  return false;
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

async function readBlobVerified(layoutRoot: string, digest: string): Promise<Buffer> {
  const hex = digest.slice("sha256:".length);
  if (!/^[a-f0-9]{64}$/.test(hex)) {
    throw new Error(`OCI digest is not sha256: ${digest}`);
  }
  const blobPath = path.join(layoutRoot, "blobs", "sha256", hex);
  return readFileVerified(blobPath, digest);
}

async function readFileVerified(
  filePath: string,
  expectedDigest: string | null,
): Promise<Buffer> {
  let raw: Buffer;
  try {
    raw = await readFile(filePath);
  } catch {
    throw new Error(
      expectedDigest
        ? `OCI blob missing for ${expectedDigest}`
        : `OCI layout file missing or invalid: ${path.basename(filePath)}`,
    );
  }
  if (expectedDigest) {
    const actual = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
    if (actual !== expectedDigest) {
      throw new Error(
        `OCI blob digest mismatch for ${path.basename(path.dirname(filePath))}/${path.basename(filePath)}: expected ${expectedDigest}, got ${actual}`,
      );
    }
  }
  return raw;
}

function parseJson<T>(raw: Buffer, label: string): T {
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    throw new Error(`OCI layout JSON invalid: ${label}`);
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
 * Test helper: write a minimal single-platform OCI layout.
 * Config bytes are hashed for real; `seed` only varies the config content.
 */
export async function writeMinimalOciLayout(
  layoutDir: string,
  input?: { seed?: string; architecture?: string },
): Promise<{ configDigest: string; manifestDigest: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const architecture = input?.architecture ?? "amd64";
  const configJson = `${JSON.stringify({
    architecture,
    os: "linux",
    rootfs: { type: "layers", diff_ids: [] },
    // Seed so callers can produce distinct digests when needed.
    okkeyTestSeed: input?.seed ?? "minimal",
  })}\n`;
  const configDigest = `sha256:${createHash("sha256").update(configJson).digest("hex")}`;
  const blobsDir = path.join(layoutDir, "blobs", "sha256");
  await mkdir(blobsDir, { recursive: true });
  await writeFile(path.join(blobsDir, configDigest.slice("sha256:".length)), configJson);

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
  await writeFile(path.join(blobsDir, manifestDigest.slice("sha256:".length)), manifestJson);

  const indexJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: manifestDigest,
        size: Buffer.byteLength(manifestJson),
        platform: { architecture, os: "linux" },
      },
    ],
  })}\n`;
  await writeFile(path.join(layoutDir, "index.json"), indexJson);
  await writeFile(path.join(layoutDir, "oci-layout"), JSON.stringify({ imageLayoutVersion: "1.0.0" }));
  return { configDigest, manifestDigest };
}

/**
 * Test helper: mirror a real `cosign save` layout —
 * root index with (1) nested image index and (2) signature descriptor (no platform),
 * nested index with per-platform manifests.
 */
export async function writeCosignSaveStyleOciLayout(
  layoutDir: string,
  input?: { seed?: string; architecture?: string },
): Promise<{ configDigest: string; manifestDigest: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const architecture = input?.architecture ?? "amd64";
  const blobsDir = path.join(layoutDir, "blobs", "sha256");
  await mkdir(blobsDir, { recursive: true });

  const writeBlob = async (contents: string): Promise<string> => {
    const digest = `sha256:${createHash("sha256").update(contents).digest("hex")}`;
    await writeFile(path.join(blobsDir, digest.slice("sha256:".length)), contents);
    return digest;
  };

  const configJson = `${JSON.stringify({
    architecture,
    os: "linux",
    rootfs: { type: "layers", diff_ids: [] },
    okkeyTestSeed: input?.seed ?? "cosign-save",
  })}\n`;
  const configDigest = await writeBlob(configJson);

  const imageManifestJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: configDigest,
      size: Buffer.byteLength(configJson),
    },
    layers: [],
  })}\n`;
  const manifestDigest = await writeBlob(imageManifestJson);

  // Other-arch stub so the nested index is multi-platform like a real save.
  const otherArch = architecture === "amd64" ? "arm64" : "amd64";
  const otherConfigJson = `${JSON.stringify({
    architecture: otherArch,
    os: "linux",
    rootfs: { type: "layers", diff_ids: [] },
    okkeyTestSeed: `${input?.seed ?? "cosign-save"}-${otherArch}`,
  })}\n`;
  const otherConfigDigest = await writeBlob(otherConfigJson);
  const otherManifestJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: otherConfigDigest,
      size: Buffer.byteLength(otherConfigJson),
    },
    layers: [],
  })}\n`;
  const otherManifestDigest = await writeBlob(otherManifestJson);

  const nestedIndexJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: manifestDigest,
        size: Buffer.byteLength(imageManifestJson),
        platform: { architecture, os: "linux" },
      },
      {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: otherManifestDigest,
        size: Buffer.byteLength(otherManifestJson),
        platform: { architecture: otherArch, os: "linux" },
      },
    ],
  })}\n`;
  const nestedIndexDigest = await writeBlob(nestedIndexJson);

  // Cosign signature manifest (ignored by the reader).
  const sigJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: configDigest,
      size: 2,
    },
    layers: [
      {
        mediaType: "application/vnd.dev.cosign.simplesigning.v1+json",
        digest: configDigest,
        size: 2,
      },
    ],
  })}\n`;
  const sigDigest = await writeBlob(sigJson);

  const rootIndexJson = `${JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      {
        mediaType: "application/vnd.oci.image.index.v1+json",
        digest: nestedIndexDigest,
        size: Buffer.byteLength(nestedIndexJson),
      },
      {
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        digest: sigDigest,
        size: Buffer.byteLength(sigJson),
        annotations: {
          "dev.cosignproject.cosign/signature": "dummy",
          "org.opencontainers.image.ref.name": "sha256-sig",
        },
      },
    ],
  })}\n`;
  await writeFile(path.join(layoutDir, "index.json"), rootIndexJson);
  await writeFile(path.join(layoutDir, "oci-layout"), JSON.stringify({ imageLayoutVersion: "1.0.0" }));
  return { configDigest, manifestDigest };
}
