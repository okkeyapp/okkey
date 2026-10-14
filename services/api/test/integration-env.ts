import type { TestContext } from "node:test";
import type { ApiConfig } from "../src/config.ts";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer, type StorageLayer } from "../src/storage/index.ts";

function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const PROBE_TIMEOUT_MS = 1_500;

type ProbeResult = { ok: true } | { ok: false; reason: string };

let cachedProbe: ProbeResult | undefined;
let probeInFlight: Promise<ProbeResult> | undefined;

function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code =
    "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
  if (error.message.trim()) {
    return code ? `${error.message} (${code})` : error.message;
  }
  if (code) {
    return code;
  }
  const nested =
    "errors" in error && Array.isArray((error as { errors?: unknown[] }).errors)
      ? (error as { errors: unknown[] }).errors.map(errorText).find((part) => part.trim())
      : undefined;
  if (nested) {
    return nested;
  }
  const details =
    "details" in error && (error as { details?: unknown }).details !== undefined
      ? errorText((error as { details?: unknown }).details)
      : undefined;
  return details || error.name || "Error";
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`));
        }, PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probePostgres(databaseUrl: string): Promise<void> {
  const pgModule = (await import("pg")) as {
    Client: new (opts: { connectionString: string; connectionTimeoutMillis?: number }) => {
      connect(): Promise<void>;
      query(sql: string): Promise<unknown>;
      end(): Promise<void>;
    };
  };
  const client = new pgModule.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: PROBE_TIMEOUT_MS,
  });
  try {
    await withTimeout(client.connect(), "postgres connect");
    await withTimeout(client.query("SELECT 1"), "postgres ping");
  } finally {
    await client.end().catch(() => {});
  }
}

async function probeRedis(redisUrl: string): Promise<void> {
  const redisModule = (await import("redis")) as {
    createClient: (options: { url: string; socket?: { connectTimeout?: number } }) => {
      connect(): Promise<void>;
      ping(): Promise<string>;
      disconnect(): Promise<void>;
      quit(): Promise<string>;
    };
  };
  const client = redisModule.createClient({
    url: redisUrl,
    socket: { connectTimeout: PROBE_TIMEOUT_MS },
  });
  try {
    await withTimeout(client.connect(), "redis connect");
    await withTimeout(client.ping(), "redis ping");
  } finally {
    await client.quit().catch(async () => {
      await client.disconnect().catch(() => {});
    });
  }
}

async function runProbe(config: ApiConfig = loadConfig()): Promise<ProbeResult> {
  try {
    await probePostgres(config.databaseUrl);
  } catch (error) {
    return {
      ok: false,
      reason: `Postgres unavailable (${errorText(error)}); start infra with yarn infra:up`,
    };
  }
  try {
    await probeRedis(config.redisUrl);
  } catch (error) {
    return {
      ok: false,
      reason: `Redis unavailable (${errorText(error)}); start infra with yarn infra:up`,
    };
  }
  // API integration tests use LocalObjectStorage; MinIO is not required here.
  return { ok: true };
}

/** Fast, cached probe so missing infra skips instead of waiting on connect retries. */
export async function probeIntegrationEnv(
  config: ApiConfig = loadConfig(),
): Promise<ProbeResult> {
  if (cachedProbe) {
    return cachedProbe;
  }
  if (!probeInFlight) {
    probeInFlight = runProbe(config).then((result) => {
      cachedProbe = result;
      return result;
    });
  }
  return probeInFlight;
}

export async function skipIfIntegrationUnavailable(
  t: Pick<TestContext, "skip">,
  config: ApiConfig = loadConfig(),
): Promise<boolean> {
  const probe = await probeIntegrationEnv(config);
  if (probe.ok) {
    return false;
  }
  t.skip(probe.reason);
  return true;
}

/**
 * Connect storage for an integration test, or skip when Postgres/Redis are down.
 * Caller still owns `t.after(() => storage.close())` when a layer is returned.
 */
export async function createIntegrationStorage(
  t: Pick<TestContext, "skip">,
  config: ApiConfig = loadConfig(),
): Promise<StorageLayer | null> {
  if (await skipIfIntegrationUnavailable(t, config)) {
    return null;
  }
  return createStorageLayer(config, createLoggerStub());
}
