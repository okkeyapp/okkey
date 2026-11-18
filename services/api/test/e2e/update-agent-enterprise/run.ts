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
  PACKAGE_IMAGE_KEYS,
  SERVICES,
  assert,
  createWorkDir,
  e2eRoot,
  generateUpdateKeyPair,
  newAgentToken,
  postJob,
  run,
  signedCorePackage,
  signedEnterprisePackage,
  startUpdateAgent,
  waitForJob,
  writeComposeFile,
  writeHtpasswd,
  writeInstallEnv,
} from "./helpers.ts";

const REGISTRY = "127.0.0.1:5000";
const REGISTRY_USER = "okkey-e2e-pull";
const REGISTRY_PASS = `e2e-pass-${process.pid}-${Date.now()}`;
const PROJECT = `okkey-e2e-${process.pid}`;
const AGENT_PORT = 18_090 + (process.pid % 1000);
/** Core-like image config (WORKDIR /app, USER root). */
const TAG_V1 = "1.0.0";
/** Enterprise-like image config (WORKDIR /okkey, USER nonroot, ENTRYPOINT). */
const TAG_V2 = "2.0.0";
const TAG_BAD = "2.0.0-unhealthy";
/** Core package tag used to exercise enterprise→core image config swap. */
const TAG_CORE_RETURN = "1.5.0";

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
    log("write registry credentials and disposable compose file");
    writeHtpasswd(paths.htpasswd, REGISTRY_USER, REGISTRY_PASS);
    writeComposeFile(paths.composeFile);

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
    for (const repo of PACKAGE_IMAGE_KEYS) {
      for (const tag of [TAG_V2, TAG_BAD]) {
        try {
          run("docker", ["rmi", "-f", `${REGISTRY}/okkey-e2e/${repo}:${tag}`]);
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
    assert(afterSuccessEnv.includes(`OKKEY_API_IMAGE=${REGISTRY}/okkey-e2e/enterprise-api`), "api image repo missing");
    assert(afterSuccessEnv.includes(`OKKEY_WEB_IMAGE=${REGISTRY}/okkey-e2e/enterprise-web`), "web image repo missing");
    assert(
      afterSuccessEnv.includes(`OKKEY_WORKER_IMAGE=${REGISTRY}/okkey-e2e/enterprise-worker`),
      "worker image repo missing",
    );
    assert(!afterSuccessEnv.includes(REGISTRY_PASS), "registry password leaked into env file");
    for (const service of SERVICES) {
      const image = runningImage(service);
      assert(image.includes(`:${TAG_V2}`), `${service} is not on ${TAG_V2}: ${image}`);
      assert(containerRunning(service), `${service} is not running after success`);
      assertImageConfig(service, {
        workingDir: "/okkey",
        user: "nonroot",
        entrypoint: ["sh", "-c"],
        gitSha: "enterprise-fixture",
      });
    }

    // --- (1b) core apply over enterprise uses core image config ---
    log("case 1b: core apply over enterprise restores core image config");
    for (const service of SERVICES) {
      try {
        run("docker", ["rmi", "-f", `${REGISTRY}/okkey-e2e/${service}:${TAG_CORE_RETURN}`]);
      } catch {
        // may already be absent locally
      }
    }
    const coreReturnPackage = signedCorePackage({
      privateKeyPem: coreKeys.privateKeyPem,
      version: TAG_CORE_RETURN,
      fromVersion: "1.4.0",
      imageTag: TAG_CORE_RETURN,
      registry: REGISTRY,
    });
    const coreStarted = await postJob(AGENT_PORT, token, coreReturnPackage, credentials);
    const coreJob = await waitForJob(AGENT_PORT, token, coreStarted.id);
    assert(
      coreJob.status === "succeeded",
      `expected core succeeded, got ${coreJob.status} ${coreJob.errorCode}: ${coreJob.errorMessage}`,
    );
    const afterCoreEnv = readFileSync(paths.envFile, "utf8");
    assert(afterCoreEnv.includes(`OKKEY_IMAGE_TAG=${TAG_CORE_RETURN}`), "core image tag was not updated");
    assert(!afterCoreEnv.includes("OKKEY_ENTERPRISE_IMAGE_TAG="), "enterprise tag pin should be cleared");
    for (const service of SERVICES) {
      const image = runningImage(service);
      assert(image.includes(`:${TAG_CORE_RETURN}`), `${service} is not on ${TAG_CORE_RETURN}: ${image}`);
      assert(containerRunning(service), `${service} is not running after core apply`);
      assertImageConfig(service, {
        workingDir: "/app",
        user: "root",
        entrypoint: null,
        gitSha: "core-fixture",
      });
    }

    // Re-apply enterprise so later rollback cases start from enterprise images again.
    log("re-apply enterprise after core return");
    for (const repo of PACKAGE_IMAGE_KEYS) {
      try {
        run("docker", ["rmi", "-f", `${REGISTRY}/okkey-e2e/${repo}:${TAG_V2}`]);
      } catch {
        // may already be absent locally
      }
    }
    const reEnterprise = await postJob(AGENT_PORT, token, successPackage, credentials);
    const reEnterpriseJob = await waitForJob(AGENT_PORT, token, reEnterprise.id);
    assert(
      reEnterpriseJob.status === "succeeded",
      `expected re-enterprise succeeded, got ${reEnterpriseJob.status} ${reEnterpriseJob.errorCode}: ${reEnterpriseJob.errorMessage}`,
    );
    for (const service of SERVICES) {
      assertImageConfig(service, {
        workingDir: "/okkey",
        user: "nonroot",
        entrypoint: ["sh", "-c"],
        gitSha: "enterprise-fixture",
      });
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
  const coreDockerfile = path.join(root, "images", "Dockerfile.core");
  const enterpriseDockerfile = path.join(root, "images", "Dockerfile.enterprise");
  const unhealthyDockerfile = path.join(root, "images", "Dockerfile.unhealthy");
  // Registry repos match signed-package image keys; compose services are api/web/worker.
  // TAG_V1 is core-like so the first enterprise apply exercises core→enterprise config swap.
  for (const repo of PACKAGE_IMAGE_KEYS) {
    const builds = [
      { tag: TAG_V1, dockerfile: coreDockerfile },
      { tag: TAG_V2, dockerfile: enterpriseDockerfile },
      { tag: TAG_BAD, dockerfile: unhealthyDockerfile },
    ];
    for (const item of builds) {
      const image = `${REGISTRY}/okkey-e2e/${repo}:${item.tag}`;
      run("docker", ["build", "-f", item.dockerfile, "-t", image, path.dirname(item.dockerfile)]);
      run("docker", ["push", image]);
    }
  }
  for (const service of SERVICES) {
    const image = `${REGISTRY}/okkey-e2e/${service}:${TAG_CORE_RETURN}`;
    run("docker", ["build", "-f", coreDockerfile, "-t", image, path.dirname(coreDockerfile)]);
    run("docker", ["push", image]);
  }
}

function assertImageConfig(
  service: string,
  expected: {
    workingDir: string;
    user: string;
    entrypoint: string[] | null;
    gitSha: string;
  },
): void {
  const id = containerId(service);
  const workingDir = run("docker", ["inspect", "--format", "{{.Config.WorkingDir}}", id]).trim();
  const user = run("docker", ["inspect", "--format", "{{.Config.User}}", id]).trim();
  const entrypointRaw = run("docker", ["inspect", "--format", "{{json .Config.Entrypoint}}", id]).trim();
  const envRaw = run("docker", ["inspect", "--format", "{{json .Config.Env}}", id]).trim();
  assert(workingDir === expected.workingDir, `${service} WorkingDir=${workingDir}, expected ${expected.workingDir}`);
  assert(user === expected.user, `${service} User=${user}, expected ${expected.user}`);
  const entrypoint = JSON.parse(entrypointRaw) as string[] | null;
  if (expected.entrypoint === null) {
    assert(
      entrypoint === null || (Array.isArray(entrypoint) && entrypoint.length === 0),
      `${service} Entrypoint=${entrypointRaw}, expected empty`,
    );
  } else {
    assert(
      JSON.stringify(entrypoint) === JSON.stringify(expected.entrypoint),
      `${service} Entrypoint=${entrypointRaw}, expected ${JSON.stringify(expected.entrypoint)}`,
    );
  }
  const env = JSON.parse(envRaw) as string[];
  assert(
    env.includes(`OKKEY_GIT_SHA=${expected.gitSha}`),
    `${service} missing OKKEY_GIT_SHA=${expected.gitSha} in ${envRaw}`,
  );
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
