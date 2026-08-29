import baselineCatalog from "./data/domain-catalog.baseline.json";
import {
  domainCapabilitiesCatalogUrls,
  domainCapabilitiesManifestUrls,
} from "./domainCapabilitiesUrls";
import type {
  DomainCapabilitiesCatalog,
  DomainCapabilitiesManifest,
} from "./domainCapabilitiesTypes";

/** Per-request timeout; mirrors race in parallel so the fastest healthy CDN wins. */
const FETCH_TIMEOUT_MS = 8_000;

export type MirrorFetchOutcome = "ok" | "error" | "aborted" | "timeout";

export type MirrorFetchAttemptLog = {
  url: string;
  host: string;
  ms: number;
  outcome: MirrorFetchOutcome;
  detail: string;
  winner: boolean;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function errorDetail(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "aborted";
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    if (/aborted|AbortError/i.test(message)) {
      return "aborted";
    }
    return message;
  }
  return String(error);
}

function outcomeFromError(error: unknown, timedOut: boolean): MirrorFetchOutcome {
  if (timedOut) {
    return "timeout";
  }
  const detail = errorDetail(error);
  if (detail === "aborted") {
    return "aborted";
  }
  return "error";
}

async function fetchJsonFromUrl(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.json();
}

function summarizePayload(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return "non-object JSON";
  }
  const row = raw as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof row.version === "string") {
    parts.push(`version=${row.version}`);
  }
  if (typeof row.sha256 === "string") {
    parts.push(`sha256=${row.sha256.slice(0, 12)}…`);
  }
  if (typeof row.entryCount === "number") {
    parts.push(`entryCount=${row.entryCount}`);
  } else if (row.entries && typeof row.entries === "object") {
    parts.push(`entries=${Object.keys(row.entries).length}`);
  }
  if (typeof row.generatedAt === "string") {
    parts.push(`generatedAt=${row.generatedAt}`);
  }
  return parts.length > 0 ? parts.join(", ") : "JSON object";
}

function logMirrorRace(label: string, attempts: readonly MirrorFetchAttemptLog[]): void {
  const winner = attempts.find((row) => row.winner);
  // Keep logs readable for debugging CDN reachability.
  console.info(`[domain-capabilities] ${label} race`, {
    requested: attempts.map((row) => row.url),
    winner: winner
      ? { host: winner.host, url: winner.url, ms: winner.ms, detail: winner.detail }
      : null,
    attempts: attempts.map((row) => ({
      host: row.host,
      url: row.url,
      ms: row.ms,
      outcome: row.outcome,
      detail: row.detail,
      winner: row.winner,
    })),
  });
}

/**
 * Race all URLs; first parseable/valid payload wins and aborts the rest.
 * Logs every mirror URL, timing, and response/error summary to the console.
 */
export async function fetchFirstJson<T>(
  urls: readonly string[],
  parse: (raw: unknown) => T | null,
  options?: {
    validate?: (value: T) => boolean;
    timeoutMs?: number;
    label?: string;
  },
): Promise<T> {
  if (urls.length === 0) {
    throw new Error("No catalog mirror URLs configured");
  }

  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const label = options?.label ?? "fetch";
  const controllers = urls.map(() => new AbortController());
  const startedAt = performance.now();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    for (const controller of controllers) {
      controller.abort();
    }
  }, timeoutMs);

  const attempts: MirrorFetchAttemptLog[] = urls.map((url) => ({
    url,
    host: hostOf(url),
    ms: 0,
    outcome: "error",
    detail: "pending",
    winner: false,
  }));

  try {
    return await new Promise<T>((resolve, reject) => {
      let pending = urls.length;
      let settled = false;
      let lastError: unknown;
      let resolvedValue: T | undefined;

      const finishIfDone = () => {
        if (pending > 0) {
          return;
        }
        logMirrorRace(label, attempts);
        if (settled && resolvedValue !== undefined) {
          resolve(resolvedValue);
          return;
        }
        reject(lastError instanceof Error ? lastError : new Error("All catalog mirrors failed"));
      };

      for (let index = 0; index < urls.length; index += 1) {
        const url = urls[index]!;
        const controller = controllers[index]!;
        const attempt = attempts[index]!;

        void (async () => {
          try {
            const raw = await fetchJsonFromUrl(url, controller.signal);
            const parsed = parse(raw);
            if (!parsed) {
              throw new Error("Invalid JSON payload");
            }
            if (options?.validate && !options.validate(parsed)) {
              throw new Error("Payload failed validation");
            }

            attempt.ms = Math.round(performance.now() - startedAt);
            attempt.outcome = "ok";
            attempt.detail = summarizePayload(raw);

            if (!settled) {
              settled = true;
              attempt.winner = true;
              resolvedValue = parsed;
              for (let j = 0; j < controllers.length; j += 1) {
                if (j !== index) {
                  controllers[j]!.abort();
                }
              }
            }
          } catch (error) {
            attempt.ms = Math.round(performance.now() - startedAt);
            attempt.outcome = outcomeFromError(error, timedOut);
            attempt.detail =
              attempt.outcome === "aborted"
                ? settled
                  ? "aborted (another mirror won)"
                  : timedOut
                    ? "aborted (timeout)"
                    : "aborted"
                : errorDetail(error);
            lastError = error;
          } finally {
            pending -= 1;
            finishIfDone();
          }
        })();
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseCatalog(raw: unknown): DomainCapabilitiesCatalog | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as DomainCapabilitiesCatalog;
  if (
    typeof row.version !== "string" ||
    typeof row.generatedAt !== "string" ||
    typeof row.sha256 !== "string" ||
    !row.entries ||
    typeof row.entries !== "object"
  ) {
    return null;
  }
  return row;
}

function parseManifest(raw: unknown): DomainCapabilitiesManifest | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as DomainCapabilitiesManifest;
  if (
    typeof row.version !== "string" ||
    typeof row.generatedAt !== "string" ||
    typeof row.sha256 !== "string" ||
    typeof row.entryCount !== "number"
  ) {
    return null;
  }
  return row;
}

export function loadBaselineDomainCapabilitiesCatalog(): DomainCapabilitiesCatalog {
  const catalog = parseCatalog(baselineCatalog);
  if (!catalog) {
    return {
      version: "baseline",
      generatedAt: new Date(0).toISOString(),
      sha256: "",
      entries: {},
    };
  }
  return catalog;
}

export async function fetchDomainCapabilitiesManifest(): Promise<DomainCapabilitiesManifest> {
  return fetchFirstJson(domainCapabilitiesManifestUrls(), parseManifest, { label: "manifest" });
}

export async function fetchDomainCapabilitiesCatalog(expectedSha256?: string): Promise<DomainCapabilitiesCatalog> {
  return fetchFirstJson(domainCapabilitiesCatalogUrls(), parseCatalog, {
    label: "catalog",
    validate: (catalog) => (expectedSha256 ? catalog.sha256 === expectedSha256 : true),
  });
}
