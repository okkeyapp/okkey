import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { RegistryPullCredentials } from "../system-updates/package-format.ts";
import {
  cosignOnPath,
  defaultCosignRunner,
  type CosignRunResult,
  type CosignRunner,
} from "./cosign-verify.ts";
import type { DockerTransport } from "./docker-engine.ts";
import { negotiateDockerApiVersion } from "./docker-engine.ts";

/**
 * Pinned cosign image used when `cosign` is not on PATH (production update-agent
 * distroless image). Override with OKKEY_COSIGN_IMAGE for emergencies only.
 *
 * The official image runs as uid 65532 (distroless nonroot). Auth config must
 * live under a world-readable path with DOCKER_CONFIG pointed at it — not
 * /root/.docker (HOME is not /root for that user).
 */
export const DEFAULT_COSIGN_DOCKER_IMAGE =
  "ghcr.io/sigstore/cosign/cosign:v3.1.4@sha256:0f06154836d2de34f887a5c273506d52ca43edaa1d9e53e6510fa78a48f69c2d";

/** Directory inside the cosign container where config.json is placed. */
export const COSIGN_DOCKER_CONFIG_DIR = "/tmp/okkey-cosign-docker";

/** Parent path for the Docker archive extract (DOCKER_CONFIG's parent). */
export const COSIGN_DOCKER_CONFIG_ARCHIVE_PARENT = "/tmp";

/** Relative tar entry for the config directory (mode 0755). */
export const COSIGN_DOCKER_CONFIG_TAR_DIR = "okkey-cosign-docker/";

/** Relative tar entry for config.json under the archive parent. */
export const COSIGN_DOCKER_CONFIG_TAR_FILE = "okkey-cosign-docker/config.json";

/**
 * Offline cosign material staging inside the cosign container (TSK-317).
 * Host `--trusted-root` / `--local-image` paths are copied here via archive
 * unless a host-visible bind root is available.
 */
export const COSIGN_DOCKER_OFFLINE_DIR = "/tmp/okkey-cosign-offline";
export const COSIGN_DOCKER_OFFLINE_ARCHIVE_PARENT = "/tmp";
export const COSIGN_DOCKER_OFFLINE_TAR_DIR = "okkey-cosign-offline/";

type VersionedRequest = (
  method: string,
  path: string,
  body?: string | Buffer,
  headers?: Record<string, string>,
) => Promise<{ status: number; body: string }>;

/**
 * Run `cosign verify …` in a one-shot container via the Docker Engine API.
 * Prefer a host/PATH cosign binary when present (tests, admin tooling).
 *
 * Registry credentials are copied into the cosign container with PUT …/archive
 * before start, and DOCKER_CONFIG is set so the nonroot cosign user reads them.
 * Bind-mounting a path written inside the update-agent container fails: Docker
 * resolves binds on the host, so the credentials never appear.
 *
 * Offline verify (TSK-317): `--trusted-root` and `--local-image` are host paths.
 * When they share a host-visible install parent (`OKKEY_INSTALL_DIR` or
 * `OKKEY_COSIGN_OFFLINE_DIR` with `OKKEY_COSIGN_OFFLINE_HOST_BIND=1`), that
 * parent is bind-mounted; otherwise material is copied via the archive API into
 * `/tmp/okkey-cosign-offline/` and args are rewritten to container paths.
 */
export function createDockerCosignRunner(
  transport: DockerTransport,
  options?: { image?: string },
): CosignRunner {
  const image = (options?.image ?? process.env.OKKEY_COSIGN_IMAGE ?? DEFAULT_COSIGN_DOCKER_IMAGE).trim();
  return async (args, runOptions) => {
    let version = "";
    try {
      version = await negotiateDockerApiVersion(transport);
    } catch (error) {
      return {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : "docker api unavailable",
        timedOut: false,
        missingBinary: true,
      };
    }

    const request: VersionedRequest = (method, apiPath, body, headers) =>
      transport(method, `/v${version}${apiPath}`, body, headers);

    try {
      await ensureImage(request, image);
    } catch (error) {
      return {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : "cosign image pull failed",
        timedOut: false,
        missingBinary: true,
      };
    }

    let containerId = "";
    const hasCredentials = Boolean(runOptions.registryCredentials);
    const offlinePlan = planOfflinePathStaging([...args]);
    try {
      const created = await request(
        "POST",
        "/containers/create",
        JSON.stringify({
          Image: image,
          // Official cosign image ENTRYPOINT is already `cosign`.
          Cmd: [...offlinePlan.containerArgs],
          Env: hasCredentials ? [`DOCKER_CONFIG=${COSIGN_DOCKER_CONFIG_DIR}`] : undefined,
          HostConfig: {
            AutoRemove: false,
            ...(offlinePlan.bind
              ? { Binds: [`${offlinePlan.bind.hostRoot}:${offlinePlan.bind.containerRoot}:ro`] }
              : {}),
          },
        }),
      );
      if (created.status >= 300) {
        return {
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: `cosign container create failed (${created.status})`,
          timedOut: false,
          missingBinary: false,
        };
      }
      const createdBody = JSON.parse(created.body) as { Id?: string };
      containerId = createdBody.Id?.trim() ?? "";
      if (!containerId) {
        return {
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: "cosign container create returned no id",
          timedOut: false,
          missingBinary: false,
        };
      }

      if (runOptions.registryCredentials) {
        await copyDockerConfigIntoContainer(request, containerId, runOptions.registryCredentials);
      }
      if (offlinePlan.copy) {
        await copyOfflineMaterialIntoContainer(request, containerId, offlinePlan.copy);
      }

      const started = await request("POST", `/containers/${containerId}/start`);
      if (started.status >= 300) {
        return {
          ok: false,
          exitCode: null,
          stdout: "",
          stderr: `cosign container start failed (${started.status})`,
          timedOut: false,
          missingBinary: false,
        };
      }

      const wait = await waitForExit(request, containerId, runOptions.timeoutMs);
      const logs = await readLogs(request, containerId);
      return {
        ok: wait.exitCode === 0 && !wait.timedOut,
        exitCode: wait.exitCode,
        stdout: logs.stdout,
        stderr: logs.stderr,
        timedOut: wait.timedOut,
        missingBinary: false,
      };
    } catch (error) {
      // Fail closed. Never echo credentials — copy/create errors are status-only;
      // still use a fixed message when auth was in play.
      const stderr = hasCredentials
        ? "cosign auth config copy failed"
        : error instanceof Error
          ? error.message
          : "cosign docker run failed";
      return {
        ok: false,
        exitCode: null,
        stdout: "",
        stderr,
        timedOut: false,
        missingBinary: false,
      };
    } finally {
      if (containerId) {
        try {
          await request("DELETE", `/containers/${containerId}?force=1`);
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  };
}

type OfflinePathStaging =
  | { containerArgs: string[]; bind?: undefined; copy?: undefined }
  | {
      containerArgs: string[];
      bind: { hostRoot: string; containerRoot: string };
      copy?: undefined;
    }
  | {
      containerArgs: string[];
      bind?: undefined;
      copy: { trustedRootHost: string; localImageHost: string };
    };

/**
 * Rewrite `--trusted-root` / `--local-image` host paths for the cosign container.
 * Exported for unit tests.
 */
export function planOfflinePathStaging(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): OfflinePathStaging {
  const trustedIdx = args.indexOf("--trusted-root");
  const localIdx = args.indexOf("--local-image");
  if (trustedIdx < 0 && localIdx < 0) {
    return { containerArgs: args };
  }
  if (trustedIdx < 0 || localIdx < 0) {
    throw new Error("offline cosign verify requires both --trusted-root and --local-image");
  }
  const trustedRootHost = args[trustedIdx + 1]?.trim() ?? "";
  const localImageHost = args[localIdx + 1]?.trim() ?? "";
  if (!trustedRootHost || !localImageHost) {
    throw new Error("offline cosign verify is missing trusted-root or local-image path");
  }

  const bindRoot = hostVisibleOfflineRoot(trustedRootHost, localImageHost, env);
  if (bindRoot) {
    // Keep host paths: they are identical inside the container after the bind.
    return {
      containerArgs: args,
      bind: { hostRoot: bindRoot, containerRoot: bindRoot },
    };
  }

  const trustedContainer = `${COSIGN_DOCKER_OFFLINE_DIR}/trusted_root.json`;
  const localContainer = `${COSIGN_DOCKER_OFFLINE_DIR}/local-image`;
  const containerArgs = [...args];
  containerArgs[trustedIdx + 1] = trustedContainer;
  containerArgs[localIdx + 1] = localContainer;
  return {
    containerArgs,
    copy: { trustedRootHost, localImageHost },
  };
}

function hostVisibleOfflineRoot(
  trustedRootHost: string,
  localImageHost: string,
  env: NodeJS.ProcessEnv,
): string | null {
  if (env.OKKEY_COSIGN_OFFLINE_HOST_BIND !== "1") {
    return null;
  }
  const candidates = [env.OKKEY_INSTALL_DIR, env.OKKEY_COSIGN_OFFLINE_DIR]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .map((value) => path.resolve(value));
  for (const root of candidates) {
    if (isPathInside(trustedRootHost, root) && isPathInside(localImageHost, root)) {
      return root;
    }
  }
  return null;
}

function isPathInside(target: string, root: string): boolean {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

/** Copy trusted_root + local-image directory into the cosign container (TSK-317). */
export async function copyOfflineMaterialIntoContainer(
  request: VersionedRequest,
  containerId: string,
  paths: { trustedRootHost: string; localImageHost: string },
): Promise<{ archiveBytes: number }> {
  const archive = await buildOfflineMaterialArchive(paths);
  const response = await request(
    "PUT",
    `/containers/${containerId}/archive?path=${encodeURIComponent(COSIGN_DOCKER_OFFLINE_ARCHIVE_PARENT)}`,
    archive,
    { "Content-Type": "application/x-tar" },
  );
  if (response.status >= 300) {
    throw new Error(`cosign offline material copy failed (${response.status})`);
  }
  return { archiveBytes: archive.length };
}

export async function buildOfflineMaterialArchive(paths: {
  trustedRootHost: string;
  localImageHost: string;
}): Promise<Buffer> {
  const trustedBytes = await readFile(paths.trustedRootHost);
  const entries: TarEntry[] = [
    { name: COSIGN_DOCKER_OFFLINE_TAR_DIR, type: "directory", mode: 0o755 },
    {
      name: `${COSIGN_DOCKER_OFFLINE_TAR_DIR}trusted_root.json`,
      type: "file",
      mode: 0o644,
      contents: trustedBytes,
    },
    { name: `${COSIGN_DOCKER_OFFLINE_TAR_DIR}local-image/`, type: "directory", mode: 0o755 },
  ];
  await walkDirIntoTar(paths.localImageHost, `${COSIGN_DOCKER_OFFLINE_TAR_DIR}local-image`, entries);
  return tarEntries(entries);
}

async function walkDirIntoTar(
  hostDir: string,
  tarPrefix: string,
  entries: TarEntry[],
): Promise<void> {
  const names = await readdir(hostDir);
  for (const name of names.sort()) {
    const hostPath = path.join(hostDir, name);
    const info = await stat(hostPath);
    const tarName = `${tarPrefix}/${name}`;
    if (info.isDirectory()) {
      entries.push({ name: `${tarName}/`, type: "directory", mode: 0o755 });
      await walkDirIntoTar(hostPath, tarName, entries);
    } else if (info.isFile()) {
      entries.push({
        name: tarName,
        type: "file",
        mode: 0o644,
        contents: await readFile(hostPath),
      });
    }
  }
}

/**
 * Build docker config.json and copy it into the cosign container under
 * COSIGN_DOCKER_CONFIG_DIR via the archive API (before start). Never log contents.
 */
export async function copyDockerConfigIntoContainer(
  request: VersionedRequest,
  containerId: string,
  credentials: RegistryPullCredentials,
): Promise<{ archiveBytes: number }> {
  const configJson = buildDockerConfigJson(credentials);
  const archive = buildCosignDockerConfigArchive(configJson);
  const response = await request(
    "PUT",
    `/containers/${containerId}/archive?path=${encodeURIComponent(COSIGN_DOCKER_CONFIG_ARCHIVE_PARENT)}`,
    archive,
    { "Content-Type": "application/x-tar" },
  );
  if (response.status >= 300) {
    throw new Error(`cosign auth config copy failed (${response.status})`);
  }
  return { archiveBytes: archive.length };
}

/** Exported for tests — builds docker config.json (callers must not log it). */
export function buildDockerConfigJson(credentials: RegistryPullCredentials): string {
  const auth = Buffer.from(`${credentials.username}:${credentials.password}`, "utf8").toString("base64");
  return `${JSON.stringify({
    auths: {
      [credentials.server]: { auth },
    },
  })}\n`;
}

/**
 * Tar with an explicit directory entry (0755) and config.json (0644) so uid
 * 65532 can traverse and read without owning /root.
 */
export function buildCosignDockerConfigArchive(configJson: string): Buffer {
  return tarEntries([
    { name: COSIGN_DOCKER_CONFIG_TAR_DIR, type: "directory", mode: 0o755 },
    { name: COSIGN_DOCKER_CONFIG_TAR_FILE, type: "file", mode: 0o644, contents: configJson },
  ]);
}

/** @deprecated Prefer buildCosignDockerConfigArchive — kept for simple single-file tests. */
export function tarFile(name: string, contents: string, mode = 0o644): Buffer {
  return tarEntries([{ name, type: "file", mode, contents }]);
}

type TarEntry =
  | { name: string; type: "directory"; mode: number }
  | { name: string; type: "file"; mode: number; contents: string | Buffer };

export function tarEntries(entries: readonly TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    if (entry.type === "directory") {
      const name = entry.name.endsWith("/") ? entry.name : `${entry.name}/`;
      parts.push(...tarEntryBlocks(name, 0, entry.mode, "5"));
    } else {
      const data = Buffer.isBuffer(entry.contents)
        ? entry.contents
        : Buffer.from(entry.contents, "utf8");
      parts.push(...tarEntryBlocks(entry.name, data.length, entry.mode, "0"));
      const paddedSize = Math.ceil(data.length / 512) * 512;
      const body = Buffer.alloc(paddedSize, 0);
      data.copy(body);
      parts.push(body);
    }
  }
  // Two zero blocks mark end of archive.
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

/**
 * Emit ustar header(s) for a path. Paths longer than 100 bytes use the ustar
 * prefix field (up to 255) or a PAX `path=` extended header when still longer
 * (real `cosign save` blob paths under okkey-cosign-offline/local-image/…).
 */
function tarEntryBlocks(
  name: string,
  size: number,
  mode: number,
  typeflag: string,
): Buffer[] {
  const nameBytes = Buffer.from(name, "utf8");
  if (nameBytes.length <= 100) {
    return [tarHeader({ name, size, mode, typeflag })];
  }
  const split = splitUstarName(name);
  if (split) {
    return [tarHeader({ name: split.name, prefix: split.prefix, size, mode, typeflag })];
  }
  // PAX extended header carries the full path; the following ustar name is a stub.
  const paxRecord = paxPathRecord(name);
  const paxName = "././@PaxHeader";
  return [
    tarHeader({ name: paxName, size: paxRecord.length, mode: 0o644, typeflag: "x" }),
    padToBlock(paxRecord),
    tarHeader({ name: name.slice(0, 100), size, mode, typeflag }),
  ];
}

/** Split `dir/…/file` into ustar prefix (≤155) + name (≤100) when possible. */
export function splitUstarName(fullPath: string): { prefix: string; name: string } | null {
  const bytes = Buffer.from(fullPath, "utf8");
  if (bytes.length <= 100) {
    return { prefix: "", name: fullPath };
  }
  // Prefer splitting on `/` so both sides stay within ustar limits.
  for (let i = Math.min(bytes.length - 1, 155 + 1); i >= 1; i -= 1) {
    if (fullPath[i] !== "/") {
      continue;
    }
    const prefix = fullPath.slice(0, i);
    const name = fullPath.slice(i + 1);
    if (
      Buffer.byteLength(prefix, "utf8") <= 155 &&
      Buffer.byteLength(name, "utf8") <= 100 &&
      name.length > 0
    ) {
      return { prefix, name };
    }
  }
  return null;
}

function paxPathRecord(fullPath: string): Buffer {
  // PAX record: `<length> path=<value>\n` where length includes its own digits.
  const body = ` path=${fullPath}\n`;
  let lengthDigits = String(body.length + 1).length;
  for (;;) {
    const total = body.length + lengthDigits;
    const next = String(total).length;
    if (next === lengthDigits) {
      return Buffer.from(`${total}${body}`, "utf8");
    }
    lengthDigits = next;
  }
}

function padToBlock(data: Buffer): Buffer {
  const paddedSize = Math.ceil(data.length / 512) * 512;
  const body = Buffer.alloc(paddedSize, 0);
  data.copy(body);
  return body;
}

function tarHeader(input: {
  name: string;
  prefix?: string;
  size: number;
  mode: number;
  typeflag: string;
}): Buffer {
  const header = Buffer.alloc(512, 0);
  const nameBytes = Buffer.from(input.name, "utf8");
  if (nameBytes.length > 100) {
    throw new Error("tar entry name field too long");
  }
  nameBytes.copy(header, 0);
  header.write(`${input.mode.toString(8).padStart(7, "0")}\0`, 100, 8, "utf8");
  header.write("0000000\0", 108, 8, "utf8"); // uid
  header.write("0000000\0", 116, 8, "utf8"); // gid
  header.write(`${input.size.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
  // Fixed mtime keeps archives deterministic for unit tests.
  header.write(`${(0).toString(8).padStart(11, "0")}\0`, 136, 12, "utf8");
  header.write("        ", 148, 8, "utf8"); // checksum placeholder
  header.write(input.typeflag, 156, 1, "utf8");
  header.write("ustar\0", 257, 6, "utf8");
  header.write("00", 263, 2, "utf8");
  if (input.prefix) {
    const prefixBytes = Buffer.from(input.prefix, "utf8");
    if (prefixBytes.length > 155) {
      throw new Error("tar entry prefix too long");
    }
    prefixBytes.copy(header, 345);
  }
  let sum = 0;
  for (let i = 0; i < 512; i += 1) {
    sum += header[i]!;
  }
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
  return header;
}

async function ensureImage(request: VersionedRequest, image: string): Promise<void> {
  const inspect = await request("GET", `/images/${encodeURIComponent(image)}/json`);
  if (inspect.status === 200) {
    return;
  }
  const { fromImage, tag } = splitImage(image);
  const query = new URLSearchParams({ fromImage, tag });
  const pull = await request("POST", `/images/create?${query.toString()}`);
  if (pull.status >= 300 || /"error"\s*:/.test(pull.body)) {
    throw new Error("cosign image is not available and could not be pulled");
  }
}

async function waitForExit(
  request: VersionedRequest,
  containerId: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; timedOut: boolean }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request("GET", `/containers/${containerId}/json`);
    if (response.status !== 200) {
      return { exitCode: null, timedOut: false };
    }
    try {
      const inspect = JSON.parse(response.body) as {
        State?: { Running?: boolean; ExitCode?: number; Status?: string };
      };
      if (inspect.State?.Running === false) {
        return {
          exitCode: typeof inspect.State.ExitCode === "number" ? inspect.State.ExitCode : null,
          timedOut: false,
        };
      }
    } catch {
      return { exitCode: null, timedOut: false };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  try {
    await request("POST", `/containers/${containerId}/kill?signal=SIGKILL`);
  } catch {
    // Ignore kill failures when already exited.
  }
  return { exitCode: null, timedOut: true };
}

async function readLogs(
  request: VersionedRequest,
  containerId: string,
): Promise<{ stdout: string; stderr: string }> {
  const response = await request(
    "GET",
    `/containers/${containerId}/logs?stdout=1&stderr=1&timestamps=0`,
  );
  if (response.status >= 300) {
    return { stdout: "", stderr: "" };
  }
  return demuxDockerLogs(Buffer.from(response.body, "binary"));
}

function demuxDockerLogs(raw: Buffer): { stdout: string; stderr: string } {
  if (raw.length === 0) {
    return { stdout: "", stderr: "" };
  }
  if (raw.length < 8 || raw[0]! > 2) {
    return { stdout: "", stderr: raw.toString("utf8") };
  }
  let offset = 0;
  let stdout = "";
  let stderr = "";
  while (offset + 8 <= raw.length) {
    const stream = raw[offset]!;
    const size = raw.readUInt32BE(offset + 4);
    offset += 8;
    const chunk = raw.subarray(offset, offset + size).toString("utf8");
    offset += size;
    if (stream === 1) {
      stdout += chunk;
    } else {
      stderr += chunk;
    }
  }
  return { stdout, stderr };
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

/** Prefer PATH cosign; otherwise use the Docker-socket cosign image runner. */
export function createPreferPathCosignRunner(dockerRunner: CosignRunner): CosignRunner {
  return async (args, options) => {
    if (cosignOnPath()) {
      return defaultCosignRunner(args, options);
    }
    return dockerRunner(args, options);
  };
}

export type { CosignRunResult };
