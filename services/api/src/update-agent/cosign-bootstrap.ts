/**
 * Ensure a pinned cosign binary is available for update-agent verify.
 *
 * Distroless api/worker images cannot ship the cosign gobinary without failing
 * the CRITICAL/HIGH Trivy gate, so the agent downloads the release asset on
 * first use (checksum-verified). Pins must stay identical to
 * scripts/ci/install-cosign.sh (asserted by scripts/test/cosign-bootstrap-pin.test.mjs).
 *
 * Override with OKKEY_COSIGN_PATH to a pre-installed binary (air-gapped hosts).
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { arch as osArch } from "node:os";
import { dirname, join } from "node:path";

import { SystemUpdateError } from "../system-updates/errors.ts";

export const COSIGN_VERSION = "2.5.3";

/** SHA-256 of cosign-linux-{amd64,arm64} for COSIGN_VERSION. */
export const COSIGN_LINUX_SHA256 = {
  amd64: "783b5d6c74105401c63946c68d9b2a4e1aab3c8abce043e06b8510b02b623ec9",
  arm64: "bffabe4cf183122b7de3111257a863c99e7dc6cf1093bfd7bf961de1795589b8",
} as const;

export type CosignArch = keyof typeof COSIGN_LINUX_SHA256;

let cachedPath: string | null = null;
let inflight: Promise<string> | null = null;

export function resolveCosignArch(nodeArch: string = process.arch || osArch()): CosignArch {
  if (nodeArch === "arm64") {
    return "arm64";
  }
  if (nodeArch === "x64" || nodeArch === "amd64" || nodeArch === "x86_64") {
    return "amd64";
  }
  throw new SystemUpdateError(
    500,
    "IMAGE_SIGNATURE_UNAVAILABLE",
    `Unsupported CPU architecture for cosign (${nodeArch}). The update was not applied`,
  );
}

export function cosignReleaseUrl(version: string, arch: CosignArch): string {
  return `https://github.com/sigstore/cosign/releases/download/v${version}/cosign-linux-${arch}`;
}

export function defaultCosignInstallPath(): string {
  const override = process.env.OKKEY_COSIGN_PATH?.trim();
  if (override) {
    return override;
  }
  return join("/tmp", "okkey-cosign", COSIGN_VERSION, "cosign");
}

/**
 * Return a path to an executable cosign binary (download + verify if needed).
 */
export async function ensureCosignBinary(options?: {
  destPath?: string;
  fetchImpl?: typeof fetch;
  runner?: (args: string[]) => Promise<{ code: number; stdout: string }>;
}): Promise<string> {
  if (cachedPath && existsSync(cachedPath)) {
    return cachedPath;
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    const dest = options?.destPath ?? defaultCosignInstallPath();
    if (existsSync(dest) && (await cosignReportsVersion(dest, options?.runner))) {
      cachedPath = dest;
      return dest;
    }
    const arch = resolveCosignArch();
    const expected = COSIGN_LINUX_SHA256[arch];
    const url = cosignReleaseUrl(COSIGN_VERSION, arch);
    const fetchImpl = options?.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch {
      throw new SystemUpdateError(
        500,
        "IMAGE_SIGNATURE_UNAVAILABLE",
        "Failed to download the pinned cosign binary, so image signatures cannot be verified. The update was not applied",
      );
    }
    if (!response.ok) {
      throw new SystemUpdateError(
        500,
        "IMAGE_SIGNATURE_UNAVAILABLE",
        `Failed to download the pinned cosign binary (HTTP ${response.status}). The update was not applied`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const actual = createHash("sha256").update(buffer).digest("hex");
    if (actual !== expected) {
      throw new SystemUpdateError(
        500,
        "IMAGE_SIGNATURE_UNAVAILABLE",
        "Pinned cosign checksum mismatch; refusing to run an untrusted binary. The update was not applied",
      );
    }
    mkdirSync(dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp-${process.pid}`;
    writeFileSync(tmp, buffer, { mode: 0o755 });
    chmodSync(tmp, 0o755);
    renameSync(tmp, dest);
    if (!(await cosignReportsVersion(dest, options?.runner))) {
      throw new SystemUpdateError(
        500,
        "IMAGE_SIGNATURE_UNAVAILABLE",
        "Downloaded cosign did not report the expected version. The update was not applied",
      );
    }
    cachedPath = dest;
    return dest;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Test helper: clear the in-memory path cache. */
export function resetCosignBootstrapCache(): void {
  cachedPath = null;
  inflight = null;
}

async function cosignReportsVersion(
  binaryPath: string,
  runner?: (args: string[]) => Promise<{ code: number; stdout: string }>,
): Promise<boolean> {
  if (runner) {
    const result = await runner(["version"]);
    return result.code === 0 && result.stdout.includes(COSIGN_VERSION);
  }
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(binaryPath, ["version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", () => resolve({ code: 127, stdout, stderr }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
  return result.code === 0 && `${result.stdout}\n${result.stderr}`.includes(COSIGN_VERSION);
}
