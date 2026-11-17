/**
 * End-to-end coverage for enterprise package apply in the update agent.
 *
 * Starts a local registry with basic auth, a disposable compose project, and
 * the real update-agent process against the host Docker engine.
 */
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ChildProcess } from "node:child_process";

import {
  SERVICES,
  assert,
  createWorkDir,
  e2eRoot,
  generateUpdateKeyPair,
  newAgentToken,
  postJob,
  run,
  signedEnterprisePackage,
  startUpdateAgent,
  waitForJob,
  writeHtpasswd,
  writeInstallEnv,
} from "./helpers.ts";

const REGISTRY = "127.0.0.1:5000";
const REGISTRY_USER = "okkey-e2e-pull";
const REGISTRY_PASS = `e2e-pass-${process.pid}-${Date.now()}`;
const PROJECT = `okkey-e2e-${process.pid}`;
const AGENT_PORT = 18_090 + (process.pid % 1000);
const TAG_V1 = "1.0.0";
const TAG_V2 = "2.0.0";
const TAG_BAD = "2.0.0-unhealthy";

async function main(): Promise<void> {
  const root = e2eRoot();
  const paths = createWorkDir(root);
  const registryName = `okkey-e2e-registry-${process.pid}`;
  let agent: ChildProcess | undefined;

  const cleanup = () => {
    try {
      agent?.kill("SIGTERM");
    } catch {
      // ignore
    }
    try {
      run("docker", ["compose", "-p", PROJECT, "-f", paths.composeFile, "down", "-v", "--remove-orphans"], {
        env: composeEnv(paths.envFile),
      });
    } catch {
      // ignore
    }
    try {
      run("docker", ["rm", "-f", registryName]);
    } catch {
      // ignore
    }
    try {
      rmSync(paths.workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    log("write registry credentials");
    writeHtpasswd(paths.htpasswd, REGISTRY_USER, REGISTRY_PASS);

    log("start local registry with basic auth");
    run("docker", [
      "run",
      "-d",
      "--name",
      registryName,
      "-p",
      "5000:5000",
      "-e",
      "REGISTRY_AUTH=htpasswd",
      "-e",
      "REGISTRY_AUTH_HTPASSWD_REALM=Okkey E2E Registry",
      "-e",
      "REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd",
      "-v",
      `${paths.htpasswd}:/auth/htpasswd:ro`,
      "registry:2",
    ]);
    await waitForRegistry(registryName);

    log("docker login to local registry");
    run("docker", ["login", REGISTRY, "-u", REGISTRY_USER, "--password-stdin"], {
      input: `${REGISTRY_PASS}\n`,
    });

    log("build and push fixture images");
    await buildAndPushImages(root);

    log("start disposable enterprise compose project");
    writeInstallEnv(paths.envFile, {
      registry: REGISTRY,
      tag: TAG_V1,
      version: TAG_V1,
      coreTag: "1.4.0",
    });
    run(
      "docker",
      ["compose", "-p", PROJECT, "-f", paths.composeFile, "up", "-d", "--pull", "missing"],
      { env: composeEnv(paths.envFile) },
    );
    await waitForComposeHealthy();

    const previousEnv = readFileSync(paths.envFile, "utf8");
    assert(previousEnv.includes(`OKKEY_ENTERPRISE_IMAGE_TAG=${TAG_V1}`), "fixture setup env was wrong");

    log("drop local v2 tags so apply must pull through credentials");
    for (const service of SERVICES) {
      for (const tag of [TAG_V2, TAG_BAD]) {
        try {
          run("docker", ["rmi", "-f", `${REGISTRY}/okkey-e2e/${service}:${tag}`]);
        } catch {
          // image may already be absent locally
        }
      }
    }

    const enterpriseKeys = generateUpdateKeyPair();
    const coreKeys = generateUpdateKeyPair();
    const token = newAgentToken();
    const credentials = {
      server: REGISTRY,
      username: REGISTRY_USER,
      password: REGISTRY_PASS,
    };

    log("start update-agent");
    agent = await startUpdateAgent({
      root,
      repoRoot: paths.repoRoot,
      token,
      enterprisePublicKeyPem: enterpriseKeys.publicKeyPem,
      corePublicKeyPem: coreKeys.publicKeyPem,
      project: PROJECT,
      installDir: paths.installDir,
      port: AGENT_PORT,
    });

    // --- (1) successful apply ---
    log("case 1: successful enterprise apply");
    const successPackage = signedEnterprisePackage({
      privateKeyPem: enterpriseKeys.privateKeyPem,
      version: TAG_V2,
      fromVersion: TAG_V1,
      imageTag: TAG_V2,
      minCoreVersion: "1.2.0",
      registry: REGISTRY,
    });
    const started = await postJob(AGENT_PORT, token, successPackage, credentials);
    const successJob = await waitForJob(AGENT_PORT, token, started.id);
    assert(
      successJob.status === "succeeded",
      `expected succeeded, got ${successJob.status} ${successJob.errorCode}: ${successJob.errorMessage}`,
    );
    assert(successJob.component === "enterprise", "job component should be enterprise");
    assert(successJob.toVersion === TAG_V2, `expected toVersion ${TAG_V2}`);
    const afterSuccessEnv = readFileSync(paths.envFile, "utf8");
    assert(afterSuccessEnv.includes(`OKKEY_ENTERPRISE_IMAGE_TAG=${TAG_V2}`), "env tag was not updated");
    assert(afterSuccessEnv.includes(`OKKEY_ENTERPRISE_VERSION=${TAG_V2}`), "env version was not updated");
    assert(!afterSuccessEnv.includes(REGISTRY_PASS), "registry password leaked into env file");
    for (const service of SERVICES) {
      const image = runningImage(service);
      assert(image.includes(`:${TAG_V2}`), `${service} is not on ${TAG_V2}: ${image}`);
      assert(containerRunning(service), `${service} is not running after success`);
    }

    // --- (2) health failure rolls back ---
    log("case 2: unhealthy package rolls back");
    const beforeRollbackEnv = readFileSync(paths.envFile, "utf8");
    const badPackage = signedEnterprisePackage({
      privateKeyPem: enterpriseKeys.privateKeyPem,
      version: "2.0.1",
      fromVersion: TAG_V2,
      imageTag: TAG_BAD,
      minCoreVersion: "1.2.0",
      registry: REGISTRY,
    });
    const badStarted = await postJob(AGENT_PORT, token, badPackage, credentials);
    const badJob = await waitForJob(AGENT_PORT, token, badStarted.id);
    assert(badJob.status === "failed", `expected failed job, got ${badJob.status}`);
    assert(badJob.errorCode === "APPLY_FAILED", `expected APPLY_FAILED, got ${badJob.errorCode}`);
    assert(
      (badJob.errorMessage ?? "").toLowerCase().includes("restored") ||
        (badJob.errorMessage ?? "").toLowerCase().includes("healthy"),
      `expected rollback message, got ${badJob.errorMessage}`,
    );
    const afterRollbackEnv = readFileSync(paths.envFile, "utf8");
    assert(afterRollbackEnv === beforeRollbackEnv, "env file changed after failed health apply");
    assert(!afterRollbackEnv.includes(REGISTRY_PASS), "registry password leaked after rollback");
    for (const service of SERVICES) {
      const image = runningImage(service);
      assert(image.includes(`:${TAG_V2}`), `${service} did not stay on ${TAG_V2} after rollback: ${image}`);
      assert(containerRunning(service), `${service} is not running after rollback`);
    }

    // --- (3) minCoreVersion refuses before changes ---
    log("case 3: minCoreVersion mismatch refuses before changes");
    writeInstallEnv(paths.envFile, {
      registry: REGISTRY,
      tag: TAG_V2,
      version: TAG_V2,
      coreTag: "1.0.0",
    });
    const beforeRefuseEnv = readFileSync(paths.envFile, "utf8");
    const beforeRefuseImages = Object.fromEntries(SERVICES.map((service) => [service, runningImage(service)]));
    const refusePackage = signedEnterprisePackage({
      privateKeyPem: enterpriseKeys.privateKeyPem,
      version: "3.0.0",
      fromVersion: TAG_V2,
      imageTag: TAG_V2,
      minCoreVersion: "9.0.0",
      registry: REGISTRY,
    });
    const refuseStarted = await postJob(AGENT_PORT, token, refusePackage, credentials);
    const refuseJob = await waitForJob(AGENT_PORT, token, refuseStarted.id);
    assert(refuseJob.status === "failed", `expected failed job, got ${refuseJob.status}`);
    assert(
      refuseJob.errorCode === "CORE_UPDATE_REQUIRED",
      `expected CORE_UPDATE_REQUIRED, got ${refuseJob.errorCode}`,
    );
    assert((refuseJob.errorMessage ?? "").includes("Update core first"), "missing update-core-first message");
    assert(readFileSync(paths.envFile, "utf8") === beforeRefuseEnv, "env changed on minCore refusal");
    for (const service of SERVICES) {
      assert(
        runningImage(service) === beforeRefuseImages[service],
        `${service} image changed on minCore refusal`,
      );
      assert(containerRunning(service), `${service} is not running after minCore refusal`);
    }

    log("all enterprise update-agent e2e cases passed");
  } finally {
    cleanup();
  }
}

function composeEnv(envFile: string): NodeJS.ProcessEnv {
  const parsed: Record<string, string> = {};
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    parsed[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return { ...process.env, ...parsed };
}

async function buildAndPushImages(root: string): Promise<void> {
  const healthyDockerfile = path.join(root, "images", "Dockerfile.healthy");
  const unhealthyDockerfile = path.join(root, "images", "Dockerfile.unhealthy");
  for (const service of SERVICES) {
    const builds = [
      { tag: TAG_V1, dockerfile: healthyDockerfile },
      { tag: TAG_V2, dockerfile: healthyDockerfile },
      { tag: TAG_BAD, dockerfile: unhealthyDockerfile },
    ];
    for (const item of builds) {
      const image = `${REGISTRY}/okkey-e2e/${service}:${item.tag}`;
      run("docker", ["build", "-f", item.dockerfile, "-t", image, path.dirname(item.dockerfile)]);
      run("docker", ["push", image]);
    }
  }
}

async function waitForRegistry(registryName: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://${REGISTRY}/v2/`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${REGISTRY_USER}:${REGISTRY_PASS}`).toString("base64")}`,
        },
      });
      if (response.status === 200) {
        return;
      }
    } catch {
      // still starting
    }
    await delay(500);
  }
  const running = run("docker", ["inspect", "--format", "{{.State.Running}}", registryName]).trim();
  throw new Error(`local registry did not become ready (running=${running})`);
}

async function waitForComposeHealthy(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (SERVICES.every((service) => containerRunning(service))) {
      return;
    }
    await delay(500);
  }
  throw new Error("compose services did not become running");
}

function containerId(service: string): string {
  const output = run("docker", [
    "ps",
    "-q",
    "--filter",
    `label=com.docker.compose.project=${PROJECT}`,
    "--filter",
    `label=com.docker.compose.service=${service}`,
  ]).trim();
  assert(output, `container for ${service} not found`);
  return output.split(/\s+/)[0] ?? "";
}

function runningImage(service: string): string {
  const id = containerId(service);
  return run("docker", ["inspect", "--format", "{{.Config.Image}}", id]).trim();
}

function containerRunning(service: string): boolean {
  try {
    const id = containerId(service);
    const status = run("docker", ["inspect", "--format", "{{.State.Running}}", id]).trim();
    return status === "true";
  } catch {
    return false;
  }
}

function log(message: string): void {
  process.stdout.write(`[update-agent-enterprise-e2e] ${message}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[update-agent-enterprise-e2e] ${message}\n`);
  process.exitCode = 1;
});
