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

/**
 * Race all URLs; first parseable/valid payload wins and aborts the rest.
 */
export async function fetchFirstJson<T>(
  urls: readonly string[],
  parse: (raw: unknown) => T | null,
  options?: {
    validate?: (value: T) => boolean;
    timeoutMs?: number;
  },
): Promise<T> {
  if (urls.length === 0) {
    throw new Error("No catalog mirror URLs configured");
  }

  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controllers = urls.map(() => new AbortController());
  const timer = setTimeout(() => {
    for (const controller of controllers) {
      controller.abort();
    }
  }, timeoutMs);

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
        if (settled && resolvedValue !== undefined) {
          resolve(resolvedValue);
          return;
        }
        reject(lastError instanceof Error ? lastError : new Error("All catalog mirrors failed"));
      };

      for (let index = 0; index < urls.length; index += 1) {
        const url = urls[index]!;
        const controller = controllers[index]!;

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

            if (!settled) {
              settled = true;
              resolvedValue = parsed;
              for (let j = 0; j < controllers.length; j += 1) {
                if (j !== index) {
                  controllers[j]!.abort();
                }
              }
            }
          } catch (error) {
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
  return fetchFirstJson(domainCapabilitiesManifestUrls(), parseManifest);
}

export async function fetchDomainCapabilitiesCatalog(expectedSha256?: string): Promise<DomainCapabilitiesCatalog> {
  return fetchFirstJson(domainCapabilitiesCatalogUrls(), parseCatalog, {
    validate: (catalog) => (expectedSha256 ? catalog.sha256 === expectedSha256 : true),
  });
}
