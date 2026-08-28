import baselineCatalog from "./data/domain-catalog.baseline.json";
import {
  domainCapabilitiesCatalogUrl,
  domainCapabilitiesManifestUrl,
} from "./domainCapabilitiesUrls";
import type {
  DomainCapabilitiesCatalog,
  DomainCapabilitiesManifest,
} from "./domainCapabilitiesTypes";

const FETCH_TIMEOUT_MS = 30_000;

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
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
  const raw = await fetchJson<unknown>(domainCapabilitiesManifestUrl());
  const manifest = parseManifest(raw);
  if (!manifest) {
    throw new Error("Invalid domain capabilities manifest");
  }
  return manifest;
}

export async function fetchDomainCapabilitiesCatalog(expectedSha256?: string): Promise<DomainCapabilitiesCatalog> {
  const raw = await fetchJson<unknown>(domainCapabilitiesCatalogUrl());
  const catalog = parseCatalog(raw);
  if (!catalog) {
    throw new Error("Invalid domain capabilities catalog");
  }
  if (expectedSha256 && catalog.sha256 !== expectedSha256) {
    throw new Error("Catalog sha256 mismatch");
  }
  return catalog;
}
