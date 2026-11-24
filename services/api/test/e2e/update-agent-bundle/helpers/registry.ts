import {
  BASE_IMAGE,
  BASE_TAG,
  CORE_IMAGE,
  CORE_TAG,
  ENTERPRISE_BAD_IMAGE,
  ENTERPRISE_BAD_TAG,
  ENTERPRISE_IMAGE,
  ENTERPRISE_TAG,
  FIXTURES_DIR,
  IMAGE_REPO,
  REGISTRY_HOST,
} from "./constants.ts";
import { run, runOk } from "./shell.ts";

const REGISTRY_NAME = "okkey-e2e-bundle-registry";

export async function startLocalRegistry(): Promise<void> {
  await stopLocalRegistry();
  await runOk("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    REGISTRY_NAME,
    "-p",
    "5000:5000",
    "registry:2",
  ]);
  await waitForRegistry();
}

export async function stopLocalRegistry(): Promise<void> {
  await run("docker", ["rm", "-f", REGISTRY_NAME]);
}

export async function buildAndPushStubImages(): Promise<void> {
  const coreLocal = "okkey-e2e-bundle-core:local";
  const enterpriseLocal = "okkey-e2e-bundle-enterprise:local";
  const unhealthyLocal = "okkey-e2e-bundle-unhealthy:local";
  await runOk("docker", [
    "build",
    "-t",
    coreLocal,
    "-f",
    `${FIXTURES_DIR}/Dockerfile.core`,
    FIXTURES_DIR,
  ]);
  await runOk("docker", [
    "build",
    "-t",
    enterpriseLocal,
    "-f",
    `${FIXTURES_DIR}/Dockerfile.enterprise`,
    FIXTURES_DIR,
  ]);
  await runOk("docker", [
    "build",
    "-t",
    unhealthyLocal,
    "-f",
    `${FIXTURES_DIR}/Dockerfile.unhealthy`,
    FIXTURES_DIR,
  ]);

  for (const [local, remote] of [
    [coreLocal, BASE_IMAGE],
    [coreLocal, CORE_IMAGE],
    [enterpriseLocal, ENTERPRISE_IMAGE],
    [unhealthyLocal, ENTERPRISE_BAD_IMAGE],
  ] as const) {
    await runOk("docker", ["tag", local, remote]);
    await runOk("docker", ["push", remote]);
  }

  // Drop update targets locally so the agent must pull them from the registry.
  for (const image of [CORE_IMAGE, ENTERPRISE_IMAGE, ENTERPRISE_BAD_IMAGE]) {
    await run("docker", ["rmi", "-f", image]);
  }

  // Keep the base tag for compose to start from.
  await runOk("docker", ["tag", coreLocal, BASE_IMAGE]);
}

async function waitForRegistry(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${REGISTRY_HOST}/v2/`);
      if (response.ok || response.status === 200) {
        return;
      }
    } catch {
      // Registry is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Local registry at ${REGISTRY_HOST} did not become ready`);
}

export function imageRef(tag: string): string {
  return `${IMAGE_REPO}:${tag}`;
}

export { BASE_TAG, CORE_TAG, ENTERPRISE_TAG, ENTERPRISE_BAD_TAG };
