import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { UpdateJob } from "../../../../src/system-updates/service.ts";
import type { UpdateApplyEngine } from "../../../../src/update-agent/apply.ts";
import { createDockerApplyEngine, unixSocketTransport } from "../../../../src/update-agent/docker-engine.ts";
import { startUpdateAgentServer } from "../../../../src/update-agent/server.ts";
import { AGENT_TOKEN } from "./constants.ts";

export function createRecordingDockerEngine(socketPath = "/var/run/docker.sock"): {
  engine: Omit<UpdateApplyEngine, "readEnvFile" | "writeEnvFile">;
  replaceOrder: string[];
} {
  const base = createDockerApplyEngine(unixSocketTransport(socketPath), {
    healthTimeoutMs: 20_000,
    healthPollMs: 500,
  });
  const replaceOrder: string[] = [];
  return {
    replaceOrder,
    engine: {
      ...base,
      async replaceContainer(container, image, envUpdates, options) {
        replaceOrder.push(container.service);
        return base.replaceContainer(container, image, envUpdates, options);
      },
    },
  };
}

export async function startAgent(input: {
  corePublicKeyPem: string;
  enterprisePublicKeyPem: string;
  project: string;
  envFilePath: string;
  engine: Omit<UpdateApplyEngine, "readEnvFile" | "writeEnvFile">;
  isolated?: boolean;
}): Promise<{ server: Server; baseUrl: string }> {
  const server = startUpdateAgentServer({
    port: 0,
    token: AGENT_TOKEN,
    publicKeyPem: input.corePublicKeyPem,
    enterprisePublicKeyPem: input.enterprisePublicKeyPem,
    coreVersion: "1.0.0",
    isolated: input.isolated ?? false,
    project: input.project,
    envFilePath: input.envFilePath,
    engine: input.engine,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export async function stopAgent(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function postJob(baseUrl: string, document: unknown): Promise<UpdateJob> {
  const response = await fetch(`${baseUrl}/v1/jobs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AGENT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(document),
  });
  const body = (await response.json()) as { job?: UpdateJob; error?: string };
  if (response.status !== 202 || !body.job) {
    throw new Error(`Job start failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return pollJob(baseUrl, body.job.id);
}

async function pollJob(baseUrl: string, jobId: string): Promise<UpdateJob> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`, {
      headers: { authorization: `Bearer ${AGENT_TOKEN}` },
    });
    if (response.status !== 200) {
      throw new Error(`Job poll failed (${response.status})`);
    }
    const body = (await response.json()) as { job?: UpdateJob };
    const job = body.job;
    if (!job) {
      throw new Error(`Job poll returned no job for ${jobId}`);
    }
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Job ${jobId} did not finish in time`);
}
