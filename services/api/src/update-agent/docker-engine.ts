import http from "node:http";

import { isSystemUpdateError, SystemUpdateError } from "../system-updates/errors.ts";
import type { RegistryPullCredentials } from "../system-updates/package-format.ts";
import { imageRepository, type ServiceContainer, type UpdateApplyEngine } from "./apply.ts";
import { encodeRegistryAuth, imageRegistryHost } from "./registry-auth.ts";

/** Highest Docker Engine API version this agent intentionally speaks. */
export const HIGHEST_SUPPORTED_DOCKER_API_VERSION = "1.52";

export type DockerTransportResult = {
  status: number;
  body: string;
  headers?: Record<string, string>;
};

export type DockerTransport = (
  method: string,
  path: string,
  body?: string | Buffer,
  headers?: Record<string, string>,
) => Promise<DockerTransportResult>;

type ImageConfig = {
  User?: string;
  Env?: string[];
  Cmd?: string[] | null;
  Entrypoint?: string[] | null;
  WorkingDir?: string;
  Labels?: Record<string, string>;
  ExposedPorts?: Record<string, unknown> | null;
  Healthcheck?: Record<string, unknown>;
};

type ImageInspectJson = ImageConfig & {
  Id?: string;
  RepoDigests?: string[];
  Config?: ImageConfig;
};

type Inspect = {
  Id?: string;
  Name?: string;
  Image?: string;
  Config?: ImageConfig & {
    Hostname?: string;
    Image?: string;
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

type ImageInspect = {
  Id?: string;
  Config?: ImageConfig;
};

const DEFAULT_HEALTH_TIMEOUT_MS = 60_000;
const DEFAULT_HEALTH_POLL_MS = 1_000;
const CLIENT_VERSION_TOO_OLD = /client version .+ is too old/i;

export function compareDockerApiVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] ?? 0;
    const b = rightParts[index] ?? 0;
    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

export function pickDockerApiVersion(input: {
  apiVersion: string | null | undefined;
  minApiVersion?: string | null | undefined;
  highestSupported?: string;
}): string {
  const apiVersion = normalizeApiVersion(input.apiVersion);
  if (!apiVersion) {
    throw new SystemUpdateError(
      502,
      "APPLY_FAILED",
      "Docker Engine did not report a usable API version",
    );
  }
  const highestSupported = normalizeApiVersion(input.highestSupported) ?? HIGHEST_SUPPORTED_DOCKER_API_VERSION;
  const minApiVersion = normalizeApiVersion(input.minApiVersion);
  const chosen =
    compareDockerApiVersions(apiVersion, highestSupported) <= 0 ? apiVersion : highestSupported;
  if (minApiVersion && compareDockerApiVersions(chosen, minApiVersion) < 0) {
    throw new SystemUpdateError(
      502,
      "APPLY_FAILED",
      `No compatible Docker Engine API version (daemon ${apiVersion}, min ${minApiVersion}, supported up to ${highestSupported})`,
    );
  }
  return chosen;
}

export function isDockerClientVersionTooOld(status: number, body: string): boolean {
  return status === 400 && CLIENT_VERSION_TOO_OLD.test(body);
}

export async function negotiateDockerApiVersion(
  transport: DockerTransport,
  options?: { highestSupported?: string },
): Promise<string> {
  const fromPing = await readVersionFromPing(transport);
  if (fromPing.apiVersion) {
    return pickDockerApiVersion({
      apiVersion: fromPing.apiVersion,
      minApiVersion: fromPing.minApiVersion,
      highestSupported: options?.highestSupported,
    });
  }
  const fromVersion = await readVersionFromVersionEndpoint(transport);
  if (fromVersion.apiVersion) {
    return pickDockerApiVersion({
      apiVersion: fromVersion.apiVersion,
      minApiVersion: fromVersion.minApiVersion,
      highestSupported: options?.highestSupported,
    });
  }
  throw new SystemUpdateError(
    502,
    "APPLY_FAILED",
    "Docker Engine did not report a usable API version",
  );
}

export function createDockerApplyEngine(
  transport: DockerTransport,
  options?: { healthTimeoutMs?: number; healthPollMs?: number },
): Omit<UpdateApplyEngine, "readEnvFile" | "writeEnvFile"> {
  const healthTimeoutMs = options?.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const healthPollMs = options?.healthPollMs ?? DEFAULT_HEALTH_POLL_MS;
  const api = createDockerApiClient(transport);
  return {
    async pullImage(image: string, credentials?: RegistryPullCredentials) {
      const { fromImage, tag } = splitImage(image);
      const query = new URLSearchParams({ fromImage, tag });
      const headers =
        credentials && imageRegistryHost(image) === credentials.server
          ? { "X-Registry-Auth": encodeRegistryAuth(credentials) }
          : undefined;
      let response: DockerTransportResult;
      try {
        response = await api.request("POST", `/images/create?${query.toString()}`, undefined, headers);
      } catch (error) {
        if (isSystemUpdateError(error)) {
          throw error;
        }
        throw new SystemUpdateError(502, "APPLY_FAILED", `Image pull failed for ${image}`);
      }
      if (response.status >= 300 || /"error"\s*:/.test(response.body)) {
        throw new SystemUpdateError(502, "APPLY_FAILED", `Image pull failed for ${image}`);
      }
    },
    async imageExists(image: string) {
      const response = await api.request("GET", `/images/${encodeURIComponent(image)}/json`);
      return response.status === 200;
    },
    async resolveImageDigest(image: string) {
      const inspect = await inspectImageJson(api, image);
      const repo = imageRepository(image);
      const digests = Array.isArray(inspect.RepoDigests) ? inspect.RepoDigests : [];
      const matched =
        digests.find((entry) => typeof entry === "string" && entry.startsWith(`${repo}@sha256:`)) ??
        digests.find((entry) => typeof entry === "string" && entry.includes("@sha256:"));
      if (!matched || typeof matched !== "string") {
        throw new SystemUpdateError(
          502,
          "APPLY_FAILED",
          `cannot resolve digest for ${image} after pull (RepoDigests empty)`,
        );
      }
      return matched;
    },
    /**
     * Image Id for isolated/offline pin when RepoDigests are empty after
     * `docker load` (TSK-317). Returns the Id with or without a `sha256:` prefix.
     */
    async resolveLocalImageId(image: string) {
      const inspect = await inspectImageJson(api, image);
      const id = typeof inspect.Id === "string" ? inspect.Id.trim() : "";
      if (!id) {
        throw new SystemUpdateError(
          502,
          "APPLY_FAILED",
          `Docker image ${image} has no Id for local pin`,
        );
      }
      return id;
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
      const response = await api.request("GET", `/containers/json?all=1&filters=${filters}`);
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
      const inspectResponse = await api.request("GET", `/containers/${container.id}/json`);
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
      const inspectResponse = await api.request("GET", `/containers/${container.id}/json`);
      if (inspectResponse.status !== 200) {
        throw new SystemUpdateError(502, "APPLY_FAILED", `Docker could not inspect ${container.service}`);
      }
      const inspect = JSON.parse(inspectResponse.body) as Inspect;
      const previousName = (inspect.Name ?? container.name).replace(/^\//, "");
      const parkedName = `${previousName}-okkey-prev`;

      const oldImageRef = (inspect.Image ?? inspect.Config?.Image ?? "").trim();
      if (!oldImageRef) {
        throw new SystemUpdateError(
          502,
          "APPLY_FAILED",
          `Docker could not resolve the previous image for ${container.service}`,
        );
      }
      const oldImage = await inspectImage(api, oldImageRef, container.service);
      const newImage = await inspectImage(api, image, container.service);

      await dockerOk(api, "POST", `/containers/${container.id}/stop?t=20`);
      await dockerOk(api, "POST", `/containers/${container.id}/rename?name=${encodeURIComponent(parkedName)}`);
      let createdId = "";
      try {
        const created = await api.request(
          "POST",
          `/containers/create?name=${encodeURIComponent(previousName)}`,
          JSON.stringify(
            buildReplaceCreateBody({
              container: inspect,
              oldImage,
              newImage,
              imageRef: image,
              envUpdates,
            }),
          ),
        );
        if (created.status >= 300) {
          throw new SystemUpdateError(502, "APPLY_FAILED", `Docker could not create ${container.service}`);
        }
        createdId = (JSON.parse(created.body) as { Id?: string }).Id ?? "";
        if (!createdId) {
          throw new SystemUpdateError(502, "APPLY_FAILED", `Docker did not return a new ${container.service} container`);
        }
        await dockerOk(api, "POST", `/containers/${createdId}/start`);
        if (replaceOptions?.requireHealthy) {
          await waitUntilHealthy(api, createdId, container.service, healthTimeoutMs, healthPollMs);
        }
      } catch (error) {
        if (createdId) {
          await api.request("DELETE", `/containers/${createdId}?force=1`);
        }
        await api.request(
          "POST",
          `/containers/${container.id}/rename?name=${encodeURIComponent(previousName)}`,
        );
        await api.request("POST", `/containers/${container.id}/start`);
        throw error;
      }
      return {
        rollback: async () => {
          await api.request("DELETE", `/containers/${createdId}?force=1`);
          await dockerOk(
            api,
            "POST",
            `/containers/${container.id}/rename?name=${encodeURIComponent(previousName)}`,
          );
          await dockerOk(api, "POST", `/containers/${container.id}/start`);
        },
        commit: async () => {
          await dockerOk(api, "DELETE", `/containers/${container.id}?force=1`);
        },
      };
    },
  };
}

export function unixSocketTransport(socketPath: string): DockerTransport {
  return (method, path, body, headers) =>
    new Promise((resolve, reject) => {
      const contentType =
        headers?.["Content-Type"] ?? headers?.["content-type"] ?? "application/json";
      const requestHeaders = {
        ...(headers ?? {}),
        ...(body
          ? {
              "Content-Type": contentType,
              "Content-Length": Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body),
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
            const responseHeaders: Record<string, string> = {};
            for (const [key, value] of Object.entries(response.headers)) {
              if (typeof value === "string") {
                responseHeaders[key] = value;
              } else if (Array.isArray(value) && value[0]) {
                responseHeaders[key] = value[0];
              }
            }
            resolve({
              status: response.statusCode ?? 500,
              body: Buffer.concat(chunks).toString("utf8"),
              headers: responseHeaders,
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

type DockerApiClient = {
  request: DockerTransport;
};

function createDockerApiClient(transport: DockerTransport): DockerApiClient {
  let cachedVersion: string | null = null;
  let renegotiated = false;

  async function ensureVersion(): Promise<string> {
    if (!cachedVersion) {
      cachedVersion = await negotiateDockerApiVersion(transport);
    }
    return cachedVersion;
  }

  return {
    async request(method, path, body, headers) {
      const version = await ensureVersion();
      const versionedPath = `/v${version}${path}`;
      const response = await transport(method, versionedPath, body, headers);
      if (!isDockerClientVersionTooOld(response.status, response.body) || renegotiated) {
        return response;
      }
      renegotiated = true;
      cachedVersion = null;
      const nextVersion = await ensureVersion();
      return transport(method, `/v${nextVersion}${path}`, body, headers);
    },
  };
}

async function readVersionFromPing(
  transport: DockerTransport,
): Promise<{ apiVersion: string | null; minApiVersion: string | null }> {
  try {
    const response = await transport("GET", "/_ping");
    if (response.status >= 300) {
      return { apiVersion: null, minApiVersion: null };
    }
    return {
      apiVersion: headerValue(response.headers, ["API-Version", "Api-Version", "api-version"]),
      minApiVersion: headerValue(response.headers, [
        "MinAPIVersion",
        "Min-API-Version",
        "minapi-version",
        "minapiversion",
      ]),
    };
  } catch {
    return { apiVersion: null, minApiVersion: null };
  }
}

async function readVersionFromVersionEndpoint(
  transport: DockerTransport,
): Promise<{ apiVersion: string | null; minApiVersion: string | null }> {
  try {
    const response = await transport("GET", "/version");
    if (response.status >= 300 || !response.body.trim()) {
      return { apiVersion: null, minApiVersion: null };
    }
    const payload = JSON.parse(response.body) as {
      ApiVersion?: unknown;
      MinAPIVersion?: unknown;
    };
    return {
      apiVersion: typeof payload.ApiVersion === "string" ? payload.ApiVersion : null,
      minApiVersion: typeof payload.MinAPIVersion === "string" ? payload.MinAPIVersion : null,
    };
  } catch {
    return { apiVersion: null, minApiVersion: null };
  }
}

function headerValue(
  headers: Record<string, string> | undefined,
  names: string[],
): string | null {
  if (!headers) {
    return null;
  }
  const entries = Object.entries(headers);
  for (const name of names) {
    const match = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    const value = match?.[1]?.trim();
    if (value) {
      return value.replace(/^v/i, "");
    }
  }
  return null;
}

function normalizeApiVersion(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().replace(/^v/i, "");
  if (!/^\d+(\.\d+)*$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseVersionParts(version: string): number[] {
  const normalized = normalizeApiVersion(version);
  if (!normalized) {
    return [0];
  }
  return normalized.split(".").map((part) => Number(part));
}

/**
 * Env keys/values set by the user or compose: present on the container but not
 * identical to the old image Config.Env. Image defaults must not be carried forward.
 */
export function userProvidedEnv(
  containerEnv: string[],
  oldImageEnv: string[],
): Record<string, string> {
  const imageMap = envToMap(oldImageEnv);
  const provided: Record<string, string> = {};
  for (const [key, value] of Object.entries(envToMap(containerEnv))) {
    if (imageMap[key] !== value) {
      provided[key] = value;
    }
  }
  return provided;
}

/**
 * Final container Env for a replace: new image defaults, then user/compose overrides,
 * then apply-time updates. New image values win for keys that only came from images
 * (for example OKKEY_GIT_SHA).
 */
export function composeReplaceEnv(input: {
  newImageEnv: string[];
  userEnv: Record<string, string>;
  updates: Record<string, string>;
}): string[] {
  return mergeEnv(mergeEnv(input.newImageEnv, input.userEnv), input.updates);
}

export function envToMap(env: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of env) {
    const eq = entry.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    map[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return map;
}

/**
 * Create-container body for an image swap.
 * Image-owned fields (WorkingDir, Entrypoint, Cmd, User, Healthcheck, ExposedPorts)
 * come from the new image. Compose/runtime fields (Hostname, Labels, mounts, networks,
 * restart, ports) come from the old container. Env is composed as above.
 */
export function buildReplaceCreateBody(input: {
  container: Inspect;
  oldImage: ImageInspect;
  newImage: ImageInspect;
  imageRef: string;
  envUpdates: Record<string, string>;
}): Record<string, unknown> {
  const containerConfig = input.container.Config ?? {};
  const newConfig = input.newImage.Config ?? {};
  const oldImageEnv = input.oldImage.Config?.Env ?? [];
  const userEnv = userProvidedEnv(containerConfig.Env ?? [], oldImageEnv);
  const networks = input.container.NetworkSettings?.Networks ?? {};
  const endpoints: Record<string, { Aliases?: string[] }> = {};
  for (const [name, network] of Object.entries(networks)) {
    endpoints[name] = { Aliases: network.Aliases ?? undefined };
  }
  const host = input.container.HostConfig ?? {};
  const body: Record<string, unknown> = {
    Hostname: containerConfig.Hostname,
    User: newConfig.User ?? "",
    Env: composeReplaceEnv({
      newImageEnv: newConfig.Env ?? [],
      userEnv,
      updates: input.envUpdates,
    }),
    Cmd: newConfig.Cmd ?? null,
    Image: input.imageRef,
    WorkingDir: newConfig.WorkingDir ?? "",
    Entrypoint: newConfig.Entrypoint ?? null,
    Labels: containerConfig.Labels ?? {},
    ExposedPorts: newConfig.ExposedPorts ?? {},
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
  if (newConfig.Healthcheck) {
    body.Healthcheck = newConfig.Healthcheck;
  }
  return body;
}

function mergeEnv(env: string[], updates: Record<string, string>): string[] {
  const keys = new Set(Object.keys(updates));
  const kept = env.filter((entry) => !keys.has(entry.split("=", 1)[0] ?? ""));
  for (const [key, value] of Object.entries(updates)) {
    kept.push(`${key}=${value}`);
  }
  return kept;
}


async function inspectImage(
  api: DockerApiClient,
  imageRef: string,
  service: string,
): Promise<ImageInspect> {
  const response = await api.request("GET", `/images/${encodeURIComponent(imageRef)}/json`);
  if (response.status !== 200) {
    throw new SystemUpdateError(
      502,
      "APPLY_FAILED",
      `Docker could not inspect image ${imageRef} for ${service}`,
    );
  }
  try {
    return JSON.parse(response.body) as ImageInspect;
  } catch {
    throw new SystemUpdateError(
      502,
      "APPLY_FAILED",
      `Docker returned an invalid image inspect for ${service}`,
    );
  }
}

async function inspectImageJson(api: DockerApiClient, image: string): Promise<ImageInspectJson> {
  const response = await api.request("GET", `/images/${encodeURIComponent(image)}/json`);
  if (response.status !== 200) {
    throw new SystemUpdateError(
      502,
      "APPLY_FAILED",
      `Docker could not inspect image ${image} to resolve its digest`,
    );
  }
  try {
    return JSON.parse(response.body) as ImageInspectJson;
  } catch {
    throw new SystemUpdateError(
      502,
      "APPLY_FAILED",
      `Docker returned an invalid image inspect for ${image}`,
    );
  }
}

async function dockerOk(api: DockerApiClient, method: string, path: string): Promise<void> {
  const response = await api.request(method, path);
  if (response.status >= 300) {
    throw new SystemUpdateError(502, "APPLY_FAILED", `Docker ${method} ${path} failed`);
  }
}

async function waitUntilHealthy(
  api: DockerApiClient,
  id: string,
  service: string,
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const failed = () =>
    new SystemUpdateError(502, "APPLY_FAILED", `Enterprise service ${service} did not become healthy`);
  for (;;) {
    const response = await api.request("GET", `/containers/${id}/json`);
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
