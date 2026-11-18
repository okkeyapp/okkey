import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ALL_SERVICES,
  BASE_IMAGE,
  FIXTURES_DIR,
  PROJECT,
} from "./constants.ts";
import { run, runOk } from "./shell.ts";

export type ComposeHarness = {
  installDir: string;
  envFilePath: string;
  project: string;
};

export async function createComposeHarness(workDir: string): Promise<ComposeHarness> {
  const installDir = path.join(workDir, "install");
  mkdirSync(installDir, { recursive: true });
  const envFilePath = path.join(installDir, ".env");
  writeBaseEnv(envFilePath);
  return { installDir, envFilePath, project: PROJECT };
}

export function writeBaseEnv(envFilePath: string): void {
  writeFileSync(
    envFilePath,
    [
      "OKKEY_IMAGE_TAG=1.0.0",
      "OKKEY_ENTERPRISE_IMAGE_TAG=1.0.0",
      "OKKEY_ENTERPRISE_VERSION=1.0.0",
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function composeUp(harness: ComposeHarness): Promise<void> {
  await composeDown();
  writeBaseEnv(harness.envFilePath);
  await runOk(
    "docker",
    [
      "compose",
      "-p",
      PROJECT,
      "-f",
      path.join(FIXTURES_DIR, "e2e-stack.yml"),
      "up",
      "-d",
      "--pull",
      "never",
      "--force-recreate",
    ],
    {
      env: {
        OKKEY_E2E_BASE_IMAGE: BASE_IMAGE,
      },
    },
  );
  await waitForServicesRunning();
}

export async function composeDown(): Promise<void> {
  await run("docker", [
    "compose",
    "-p",
    PROJECT,
    "-f",
    path.join(FIXTURES_DIR, "e2e-stack.yml"),
    "down",
    "--remove-orphans",
    "-v",
  ]);
}

export async function serviceImage(service: string): Promise<string> {
  const result = await runOk("docker", [
    "ps",
    "-a",
    "--filter",
    `label=com.docker.compose.project=${PROJECT}`,
    "--filter",
    `label=com.docker.compose.service=${service}`,
    "--format",
    "{{.Image}}",
  ]);
  const image = result.stdout.trim().split("\n").filter(Boolean)[0] ?? "";
  if (!image) {
    throw new Error(`No running container for compose service ${service}`);
  }
  return image;
}

export async function serviceConfig(service: string): Promise<{
  workingDir: string;
  user: string;
  entrypoint: string[] | null;
  env: string[];
}> {
  const idResult = await runOk("docker", [
    "ps",
    "-q",
    "--filter",
    `label=com.docker.compose.project=${PROJECT}`,
    "--filter",
    `label=com.docker.compose.service=${service}`,
  ]);
  const id = idResult.stdout.trim().split(/\s+/)[0] ?? "";
  if (!id) {
    throw new Error(`No running container for compose service ${service}`);
  }
  const workingDir = (await runOk("docker", ["inspect", "--format", "{{.Config.WorkingDir}}", id])).stdout.trim();
  const user = (await runOk("docker", ["inspect", "--format", "{{.Config.User}}", id])).stdout.trim();
  const entrypoint = JSON.parse(
    (await runOk("docker", ["inspect", "--format", "{{json .Config.Entrypoint}}", id])).stdout.trim(),
  ) as string[] | null;
  const env = JSON.parse(
    (await runOk("docker", ["inspect", "--format", "{{json .Config.Env}}", id])).stdout.trim(),
  ) as string[];
  return { workingDir, user, entrypoint, env };
}

export async function readEnvFile(envFilePath: string): Promise<string> {
  const { readFileSync } = await import("node:fs");
  return readFileSync(envFilePath, "utf8");
}

async function waitForServicesRunning(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const missing: string[] = [];
    for (const service of ALL_SERVICES) {
      const result = await run("docker", [
        "ps",
        "--filter",
        `label=com.docker.compose.project=${PROJECT}`,
        "--filter",
        `label=com.docker.compose.service=${service}`,
        "--filter",
        "status=running",
        "--format",
        "{{.ID}}",
      ]);
      if (!result.stdout.trim()) {
        missing.push(service);
      }
    }
    if (missing.length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Compose project ${PROJECT} did not start all services`);
}
