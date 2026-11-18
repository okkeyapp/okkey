import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  generateUpdateKeyPair,
  signOfflinePackage,
  type OfflinePackagePayload,
  type RegistryPullCredentials,
  type SignedOfflinePackage,
} from "../../../src/system-updates/package-format.ts";

/** Production compose services that host enterprise images. */
export const SERVICES = ["api", "web", "worker"] as const;

/** Signed-package image keys (unchanged for package compatibility). */
export const PACKAGE_IMAGE_KEYS = ["enterprise-api", "enterprise-web", "enterprise-worker"] as const;

export type E2ePaths = {
  root: string;
  repoRoot: string;
  workDir: string;
  installDir: string;
  envFile: string;
  authDir: string;
  htpasswd: string;
  composeFile: string;
  stackDir: string;
};

export type UpdateJob = {
  id: string;
  status: string;
  progress: number;
  component: string;
  fromVersion: string;
  toVersion: string;
  errorCode?: string;
  errorMessage?: string;
};

export function e2eRoot(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function createWorkDir(root: string): E2ePaths {
  const workDir = path.join(tmpdir(), `okkey-update-agent-e2e-${process.pid}-${Date.now()}`);
  const installDir = path.join(workDir, "install");
  const authDir = path.join(workDir, "auth");
  const stackDir = path.join(workDir, "stack");
  mkdirSync(installDir, { recursive: true });
  mkdirSync(authDir, { recursive: true });
  mkdirSync(stackDir, { recursive: true });
  return {
    root,
    repoRoot: path.resolve(root, "../../../../.."),
    workDir,
    installDir,
    envFile: path.join(installDir, ".env"),
    authDir,
    htpasswd: path.join(authDir, "htpasswd"),
    stackDir,
    composeFile: path.join(stackDir, "compose.yml"),
  };
}

/** Written only under the disposable work dir so supply-chain digest scans ignore it. */
export function writeComposeFile(composeFile: string): void {
  writeFileSync(
    composeFile,
    `# Disposable compose project for the update-agent enterprise apply e2e.
# Mirrors production: api/web/worker with OKKEY_*_IMAGE + enterprise tag fallback.
services:
  api:
    image: \${OKKEY_API_IMAGE}:\${OKKEY_ENTERPRISE_IMAGE_TAG:-\${OKKEY_IMAGE_TAG}}
    restart: "no"
    environment:
      OKKEY_ENTERPRISE_VERSION: \${OKKEY_ENTERPRISE_VERSION:-}
      OKKEY_ENTERPRISE_IMAGE_TAG: \${OKKEY_ENTERPRISE_IMAGE_TAG:-}
    healthcheck:
      test: ["CMD-SHELL", "exit 0"]
      interval: 1s
      timeout: 1s
      retries: 1
      start_period: 0s

  web:
    image: \${OKKEY_WEB_IMAGE}:\${OKKEY_ENTERPRISE_IMAGE_TAG:-\${OKKEY_IMAGE_TAG}}
    restart: "no"
    environment:
      OKKEY_ENTERPRISE_VERSION: \${OKKEY_ENTERPRISE_VERSION:-}
      OKKEY_ENTERPRISE_IMAGE_TAG: \${OKKEY_ENTERPRISE_IMAGE_TAG:-}
    healthcheck:
      test: ["CMD-SHELL", "exit 0"]
      interval: 1s
      timeout: 1s
      retries: 1
      start_period: 0s

  worker:
    image: \${OKKEY_WORKER_IMAGE}:\${OKKEY_ENTERPRISE_IMAGE_TAG:-\${OKKEY_IMAGE_TAG}}
    restart: "no"
    environment:
      OKKEY_ENTERPRISE_VERSION: \${OKKEY_ENTERPRISE_VERSION:-}
      OKKEY_ENTERPRISE_IMAGE_TAG: \${OKKEY_ENTERPRISE_IMAGE_TAG:-}
    healthcheck:
      test: ["CMD-SHELL", "exit 0"]
      interval: 1s
      timeout: 1s
      retries: 1
      start_period: 0s
`,
    "utf8",
  );
}

export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    input: options.input,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout ?? "";
}

export function writeHtpasswd(filePath: string, username: string, password: string): void {
  const entry = run("htpasswd", ["-Bbn", username, password]).trim();
  writeFileSync(filePath, `${entry}\n`, "utf8");
}

export function writeInstallEnv(
  envFile: string,
  input: {
    registry: string;
    tag: string;
    version: string;
    coreTag: string;
  },
): void {
  const repo = (packageKey: string) => `${input.registry}/okkey-e2e/${packageKey}`;
  writeFileSync(
    envFile,
    [
      `OKKEY_IMAGE_TAG=${input.coreTag}`,
      `OKKEY_ENTERPRISE_IMAGE_TAG=${input.tag}`,
      `OKKEY_ENTERPRISE_VERSION=${input.version}`,
      `OKKEY_API_IMAGE=${repo("enterprise-api")}`,
      `OKKEY_WEB_IMAGE=${repo("enterprise-web")}`,
      `OKKEY_WORKER_IMAGE=${repo("enterprise-worker")}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

export function enterpriseImages(registry: string, tag: string): Record<string, string> {
  return {
    "enterprise-api": `${registry}/okkey-e2e/enterprise-api:${tag}`,
    "enterprise-web": `${registry}/okkey-e2e/enterprise-web:${tag}`,
    "enterprise-worker": `${registry}/okkey-e2e/enterprise-worker:${tag}`,
  };
}

export function signedEnterprisePackage(input: {
  privateKeyPem: string;
  version: string;
  fromVersion: string;
  imageTag: string;
  minCoreVersion: string;
  registry: string;
}): SignedOfflinePackage {
  const payload: OfflinePackagePayload = {
    format: "okkey-offline-package",
    formatVersion: 1,
    component: "enterprise",
    version: input.version,
    fromVersion: input.fromVersion,
    summary: "Update-agent enterprise apply e2e package",
    releasedAt: new Date().toISOString(),
    imageTag: input.imageTag,
    minCoreVersion: input.minCoreVersion,
    images: enterpriseImages(input.registry, input.imageTag),
  };
  return signOfflinePackage(payload, input.privateKeyPem);
}

export function newAgentToken(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

export async function startUpdateAgent(input: {
  root: string;
  repoRoot: string;
  token: string;
  enterprisePublicKeyPem: string;
  corePublicKeyPem: string;
  project: string;
  installDir: string;
  port: number;
}): Promise<ChildProcess> {
  const main = path.join(input.root, "../../../src/update-agent/main.ts");
  const child = spawn(process.execPath, ["--experimental-strip-types", main], {
    cwd: input.repoRoot,
    env: {
      ...process.env,
      OKKEY_UPDATE_AGENT_PORT: String(input.port),
      OKKEY_UPDATE_AGENT_TOKEN: input.token,
      OKKEY_UPDATE_TRUSTED_PUBLIC_KEY: input.corePublicKeyPem,
      OKKEY_UPDATE_ENTERPRISE_TRUSTED_PUBLIC_KEY: input.enterprisePublicKeyPem,
      OKKEY_UPDATE_ISOLATED: "false",
      OKKEY_COMPOSE_PROJECT: input.project,
      OKKEY_INSTALL_DIR: input.installDir,
      OKKEY_VERSION: "1.4.0",
      DOCKER_SOCKET: "/var/run/docker.sock",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stdout += text;
    if (text.includes("listening")) {
      ready = true;
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    process.stderr.write(chunk);
  });
  for (let attempt = 0; attempt < 50 && !ready && child.exitCode === null; attempt += 1) {
    await delay(100);
  }
  if (!ready || child.exitCode !== null) {
    child.kill("SIGKILL");
    throw new Error(`update-agent failed to start\nstdout=${stdout}\nstderr=${stderr}`);
  }
  return child;
}

export async function postJob(
  port: number,
  token: string,
  document: SignedOfflinePackage,
  credentials?: RegistryPullCredentials,
): Promise<UpdateJob> {
  const body = credentials ? { ...document, registryCredentials: credentials } : document;
  const response = await fetch(`http://127.0.0.1:${port}/v1/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status !== 202) {
    throw new Error(`start job failed (${response.status}): ${text}`);
  }
  return (JSON.parse(text) as { job: UpdateJob }).job;
}

export async function waitForJob(port: number, token: string, jobId: string): Promise<UpdateJob> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/v1/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`poll job failed (${response.status}): ${text}`);
    }
    const job = (JSON.parse(text) as { job: UpdateJob }).job;
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    await delay(500);
  }
  throw new Error(`job ${jobId} did not finish in time`);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export { generateUpdateKeyPair };
