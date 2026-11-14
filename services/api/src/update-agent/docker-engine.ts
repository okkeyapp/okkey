import http from "node:http";

import { SystemUpdateError } from "../system-updates/errors.ts";
import type { RegistryPullCredentials } from "../system-updates/package-format.ts";
import type { ServiceContainer, UpdateApplyEngine } from "./apply.ts";
import { encodeRegistryAuth, imageRegistryHost } from "./registry-auth.ts";

export type DockerTransport = (
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<{ status: number; body: string }>;

type Inspect = {
  Id?: string;
  Name?: string;
  Config?: {
    Hostname?: string;
    User?: string;
    Env?: string[];
    Cmd?: string[] | null;
    Image?: string;
    WorkingDir?: string;
    Entrypoint?: string[] | null;
    Labels?: Record<string, string>;
    ExposedPorts?: Record<string, unknown> | null;
  };
  HostConfig?: Record<string, unknown>;
  NetworkSettings?: {
    Networks?: Record<string, { Aliases?: string[] | null }>;
  };
  State?: {
    Running?: boolean;
    Status?: string;
    Health?: { Status?: string };
  };
};

const DEFAULT_HEALTH_TIMEOUT_MS = 60_000;
const DEFAULT_HEALTH_POLL_MS = 1_000;

export function createDockerApplyEngine(
  transport: DockerTransport,
  options?: { healthTimeoutMs?: number; healthPollMs?: number },
): Omit<UpdateApplyEngine, "readEnvFile" | "writeEnvFile"> {
  const healthTimeoutMs = options?.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const healthPollMs = options?.healthPollMs ?? DEFAULT_HEALTH_POLL_MS;
  return {
    async pullImage(image: string, credentials?: RegistryPullCredentials) {
      const { fromImage, tag } = splitImage(image);
      const query = new URLSearchParams({ fromImage, tag });
      const headers =
        credentials && imageRegistryHost(image) === credentials.server
          ? { "X-Registry-Auth": encodeRegistryAuth(credentials) }
          : undefined;
      let response: { status: number; body: string };
      try {
        response = await transport("POST", `/v1.43/images/create?${query.toString()}`, undefined, headers);
      } catch {
        throw new SystemUpdateError(502, "APPLY_FAILED", `Image pull failed for ${image}`);
      }
      if (response.status >= 300 || /"error"\s*:/.test(response.body)) {
        throw new SystemUpdateError(502, "APPLY_FAILED", `Image pull failed for ${image}`);
      }
    },
    async imageExists(image: string) {
      const response = await transport(
        "GET",
        `/v1.43/images/${encodeURIComponent(image)}/json`,
      );
      return response.status === 200;
    },
    async findServiceContainer(project, service) {
      const filters = encodeURIComponent(
        JSON.stringify({
          label: [
            `com.docker.compose.project=${project}`,
            `com.docker.compose.service=${service}`,
          ],
        }),
      );
      const response = await transport("GET", `/v1.43/containers/json?all=1&filters=${filters}`);
      if (response.status >= 300) {
        throw new SystemUpdateError(502, "APPLY_FAILED", "Docker could not list containers");
      }
      const list = JSON.parse(response.body) as Array<{
        Id: string;
        Names?: string[];
        Image: string;
      }>;
      const first = list[0];
      if (!first) {
        return null;
      }
      const name = (first.Names?.[0] ?? "").replace(/^\//, "");
      return { id: first.Id, name, service, image: first.Image };
    },
    async readRunningCoreVersion(project) {
      const container = await this.findServiceContainer(project, "api");
      if (!container) {
        return null;
      }
      const inspectResponse = await transport("GET", `/v1.43/containers/${container.id}/json`);
      if (inspectResponse.status !== 200) {
        return null;
      }
      try {
        const inspect = JSON.parse(inspectResponse.body) as Inspect;
        const entry = (inspect.Config?.Env ?? []).find((item) => item.startsWith("OKKEY_VERSION="));
        const value = entry?.slice("OKKEY_VERSION=".length).trim() ?? "";
        return value || null;
      } catch {
        return null;
      }
    },
    async replaceContainer(container, image, envUpdates, replaceOptions) {
      const inspectResponse = await transport("GET", `/v1.43/containers/${container.id}/json`);
      if (inspectResponse.status !== 200) {
        throw new SystemUpdateError(502, "APPLY_FAILED", `Docker could not inspect ${container.service}`);
      }
      const inspect = JSON.parse(inspectResponse.body) as Inspect;
      const previousName = (inspect.Name ?? container.name).replace(/^\//, "");
      const parkedName = `${previousName}-okkey-prev`;
      await dockerOk(transport, "POST", `/v1.43/containers/${container.id}/stop?t=20`);
      await dockerOk(transport, "POST", `/v1.43/containers/${container.id}/rename?name=${encodeURIComponent(parkedName)}`);
      let createdId = "";
      try {
        const created = await transport(
          "POST",
          `/v1.43/containers/create?name=${encodeURIComponent(previousName)}`,
          JSON.stringify(createBody(inspect, image, envUpdates)),
        );
        if (created.status >= 300) {
          throw new SystemUpdateError(502, "APPLY_FAILED", `Docker could not create ${container.service}`);
        }
        createdId = (JSON.parse(created.body) as { Id?: string }).Id ?? "";
        if (!createdId) {
          throw new SystemUpdateError(502, "APPLY_FAILED", `Docker did not return a new ${container.service} container`);
        }
        await dockerOk(transport, "POST", `/v1.43/containers/${createdId}/start`);
        if (replaceOptions?.requireHealthy) {
          await waitUntilHealthy(transport, createdId, container.service, healthTimeoutMs, healthPollMs);
        }
      } catch (error) {
        if (createdId) {
          await transport("DELETE", `/v1.43/containers/${createdId}?force=1`);
        }
        await transport(
          "POST",
          `/v1.43/containers/${container.id}/rename?name=${encodeURIComponent(previousName)}`,
        );
        await transport("POST", `/v1.43/containers/${container.id}/start`);
        throw error;
      }
      return {
        rollback: async () => {
          await transport("DELETE", `/v1.43/containers/${createdId}?force=1`);
          await dockerOk(
            transport,
            "POST",
            `/v1.43/containers/${container.id}/rename?name=${encodeURIComponent(previousName)}`,
          );
          await dockerOk(transport, "POST", `/v1.43/containers/${container.id}/start`);
        },
        commit: async () => {
          await dockerOk(transport, "DELETE", `/v1.43/containers/${container.id}?force=1`);
        },
      };
    },
  };
}

export function unixSocketTransport(socketPath: string): DockerTransport {
  return (method, path, body, headers) =>
    new Promise((resolve, reject) => {
      const requestHeaders = {
        ...(headers ?? {}),
        ...(body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : {}),
      };
      const request = http.request(
        {
          socketPath,
          path,
          method,
          headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 500,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      request.on("error", reject);
      if (body) {
        request.write(body);
      }
      request.end();
    });
}

function createBody(inspect: Inspect, image: string, envUpdates: Record<string, string>) {
  const config = inspect.Config ?? {};
  const networks = inspect.NetworkSettings?.Networks ?? {};
  const endpoints: Record<string, { Aliases?: string[] }> = {};
  for (const [name, network] of Object.entries(networks)) {
    endpoints[name] = { Aliases: network.Aliases ?? undefined };
  }
  const host = inspect.HostConfig ?? {};
  return {
    Hostname: config.Hostname,
    User: config.User,
    Env: mergeEnv(config.Env ?? [], envUpdates),
    Cmd: config.Cmd,
    Image: image,
    WorkingDir: config.WorkingDir,
    Entrypoint: config.Entrypoint,
    Labels: config.Labels,
    ExposedPorts: config.ExposedPorts,
    HostConfig: {
      Binds: host.Binds,
      PortBindings: host.PortBindings,
      RestartPolicy: host.RestartPolicy,
      NetworkMode: host.NetworkMode,
      ExtraHosts: host.ExtraHosts,
      LogConfig: host.LogConfig,
      Privileged: host.Privileged,
      ReadonlyRootfs: host.ReadonlyRootfs,
      Mounts: host.Mounts,
      NanoCpus: host.NanoCpus,
      Memory: host.Memory,
    },
    NetworkingConfig: { EndpointsConfig: endpoints },
  };
}

function mergeEnv(env: string[], updates: Record<string, string>): string[] {
  const keys = new Set(Object.keys(updates));
  const kept = env.filter((entry) => !keys.has(entry.split("=", 1)[0] ?? ""));
  for (const [key, value] of Object.entries(updates)) {
    kept.push(`${key}=${value}`);
  }
  return kept;
}

async function dockerOk(transport: DockerTransport, method: string, path: string): Promise<void> {
  const response = await transport(method, path);
  if (response.status >= 300) {
    throw new SystemUpdateError(502, "APPLY_FAILED", `Docker ${method} ${path} failed`);
  }
}

async function waitUntilHealthy(
  transport: DockerTransport,
  id: string,
  service: string,
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const failed = () =>
    new SystemUpdateError(502, "APPLY_FAILED", `Enterprise service ${service} did not become healthy`);
  for (;;) {
    const response = await transport("GET", `/v1.43/containers/${id}/json`);
    if (response.status !== 200) {
      throw failed();
    }
    let state: NonNullable<Inspect["State"]>;
    try {
      state = (JSON.parse(response.body) as Inspect).State ?? {};
    } catch {
      throw failed();
    }
    const health = state.Health?.Status;
    if (health === "healthy" || (!health && state.Running === true)) {
      return;
    }
    if (health === "unhealthy" || state.Status === "exited" || state.Status === "dead") {
      throw failed();
    }
    if (Date.now() >= deadline) {
      throw failed();
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

function splitImage(image: string): { fromImage: string; tag: string } {
  const digest = image.lastIndexOf("@");
  if (digest > 0) {
    return { fromImage: image.slice(0, digest), tag: image.slice(digest + 1) };
  }
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  if (colon > slash) {
    return { fromImage: image.slice(0, colon), tag: image.slice(colon + 1) };
  }
  return { fromImage: image, tag: "latest" };
}
