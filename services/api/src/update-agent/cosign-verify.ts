import { spawn } from "node:child_process";

import { SystemUpdateError } from "../system-updates/errors.ts";
import { imageRepository } from "./apply.ts";
import {
  resolveCosignIdentityRegexp,
  resolveCosignOidcIssuer,
  type CosignImageKind,
  type CosignIdentityEnv,
} from "./cosign-identity.ts";

export type CosignVerifyEnv = CosignIdentityEnv & {
  OKKEY_SKIP_COSIGN_VERIFY?: string;
  OKKEY_UPDATE_AGENT_COSIGN_TEST_BYPASS?: string;
  NODE_ENV?: string;
  DEPLOY_ENV?: string;
  PATH?: string;
};

/** Process-boundary runner. Unit tests mock this instead of spawning cosign. */
export type CosignProcessRunner = (input: {
  args: string[];
  env: NodeJS.ProcessEnv;
}) => Promise<{ code: number; stdout: string; stderr: string }>;

export type VerifyTargetImagesInput = {
  images: readonly string[];
  kind: CosignImageKind;
  /** Prefer digest refs (name@sha256:…). Required for each image before verify. */
  resolveDigestRef: (image: string) => Promise<string>;
  env?: CosignVerifyEnv;
  runner?: CosignProcessRunner;
  cosignPath?: string;
  log?: (message: string) => void;
};

/**
 * Verify cosign keyless signatures for every target image before apply.
 * Fail-closed: missing cosign, verify errors, unsigned, or wrong identity → throw.
 * Does not apply any update; callers must not mutate the stack until this resolves.
 */
export async function verifyTargetImageSignatures(input: VerifyTargetImagesInput): Promise<void> {
  const env = input.env ?? process.env;
  const log = input.log ?? ((message: string) => process.stderr.write(`${message}\n`));

  if (shouldSkipCosignVerify(env, log)) {
    return;
  }

  const cosignPath = input.cosignPath ?? "cosign";
  const runner = input.runner ?? defaultCosignRunner(cosignPath);
  if (!(await cosignAvailable(runner, env))) {
    throw new SystemUpdateError(
      500,
      "IMAGE_SIGNATURE_UNAVAILABLE",
      "cosign is not installed, so image signatures cannot be verified. The update was not applied",
    );
  }

  const identityRegexp = resolveCosignIdentityRegexp(input.kind, env);
  const oidcIssuer = resolveCosignOidcIssuer(env);

  for (const image of input.images) {
    const digestRef = await input.resolveDigestRef(image);
    log(`Verifying cosign signature: ${digestRef}`);
    const result = await runner({
      args: [
        "verify",
        "--certificate-identity-regexp",
        identityRegexp,
        "--certificate-oidc-issuer",
        oidcIssuer,
        digestRef,
      ],
      env: processEnvForCosign(env),
    });
    if (result.code !== 0) {
      const detail = scrubCosignOutput(`${result.stderr}\n${result.stdout}`.trim());
      log(`cosign verify failed for ${digestRef}${detail ? `: ${detail}` : ""}`);
      throw new SystemUpdateError(
        400,
        "IMAGE_SIGNATURE_INVALID",
        `Image signature verification failed for ${digestRef}. The image is unsigned or was not signed by the expected publish workflow. The update was not applied`,
      );
    }
  }
  log(`Image signatures OK (${input.images.length})`);
}

/**
 * Emergency bypass (same env as install.sh) or a test-only switch that is
 * ignored when NODE_ENV=production or DEPLOY_ENV=prod.
 */
export function shouldSkipCosignVerify(
  env: CosignVerifyEnv = process.env,
  log: (message: string) => void = () => {},
): boolean {
  if (env.OKKEY_SKIP_COSIGN_VERIFY === "1") {
    log(
      "WARNING: image signature verification is DISABLED (OKKEY_SKIP_COSIGN_VERIFY=1). Emergency bypass only",
    );
    return true;
  }
  if (env.OKKEY_UPDATE_AGENT_COSIGN_TEST_BYPASS !== "1") {
    return false;
  }
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  const deployEnv = (env.DEPLOY_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production" || deployEnv === "prod") {
    log(
      "WARNING: OKKEY_UPDATE_AGENT_COSIGN_TEST_BYPASS is set but ignored in production builds",
    );
    return false;
  }
  // Silent when NODE_ENV=test — unit tests enable this via apply-api-test-rate-limits.
  return nodeEnv === "test";
}

/** Pick name@sha256:… from Docker RepoDigests, preferring the image repository. */
export function digestRefFromRepoDigests(image: string, repoDigests: readonly string[]): string {
  if (image.includes("@sha256:")) {
    return image;
  }
  const repo = imageRepository(image);
  const exact = repoDigests.find((entry) => entry.startsWith(`${repo}@sha256:`));
  if (exact) {
    return exact;
  }
  const any = repoDigests.find((entry) => /@sha256:[a-f0-9]{64}$/i.test(entry));
  if (any) {
    return any;
  }
  throw new SystemUpdateError(
    500,
    "IMAGE_SIGNATURE_UNAVAILABLE",
    `Cannot resolve a registry digest for ${image} after pull (RepoDigests empty). The update was not applied`,
  );
}

export function defaultCosignRunner(cosignPath: string): CosignProcessRunner {
  return ({ args, env }) =>
    new Promise((resolve) => {
      const child = spawn(cosignPath, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        resolve({
          code: 127,
          stdout,
          stderr: error instanceof Error ? error.message : "cosign spawn failed",
        });
      });
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
}

async function cosignAvailable(runner: CosignProcessRunner, env: CosignVerifyEnv): Promise<boolean> {
  const result = await runner({
    args: ["version"],
    env: processEnvForCosign(env),
  });
  return result.code === 0;
}

function processEnvForCosign(env: CosignVerifyEnv): NodeJS.ProcessEnv {
  // Do not forward registry credentials into cosign. Keep PATH for the binary.
  const next: NodeJS.ProcessEnv = {
    PATH: env.PATH ?? process.env.PATH,
    HOME: process.env.HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    TMPDIR: process.env.TMPDIR,
  };
  // Cosign may need CA / SSL defaults from the process environment.
  if (process.env.SSL_CERT_FILE) {
    next.SSL_CERT_FILE = process.env.SSL_CERT_FILE;
  }
  if (process.env.SSL_CERT_DIR) {
    next.SSL_CERT_DIR = process.env.SSL_CERT_DIR;
  }
  return next;
}

/** Drop tokens that look like credentials from cosign stderr before logging. */
function scrubCosignOutput(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-+=\/]+/gi, "Bearer [redacted]")
    .replace(/password[=:]\s*\S+/gi, "password=[redacted]")
    .replace(/ghp_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/gho_[A-Za-z0-9]+/g, "[redacted]")
    .slice(0, 500);
}
