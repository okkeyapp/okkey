const DEFAULT_REPO = "okkeyapp/domain-capabilities";
const DEFAULT_BRANCH = "main";

function repoFromEnv(): string {
  const raw = import.meta.env.VITE_DOMAIN_CAPABILITIES_REPO?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_REPO;
}

function branchFromEnv(): string {
  const raw = import.meta.env.VITE_DOMAIN_CAPABILITIES_BRANCH?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_BRANCH;
}

function rawBaseUrl(): string {
  const manifestOverride = import.meta.env.VITE_DOMAIN_CAPABILITIES_MANIFEST_URL?.trim();
  if (manifestOverride) {
    return manifestOverride.replace(/\/data\/manifest\.json$/i, "");
  }
  const repo = repoFromEnv();
  const branch = branchFromEnv();
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}

export const DOMAIN_CAPABILITIES_REPO_URL = `https://github.com/${repoFromEnv()}`;

export function domainCapabilitiesManifestUrl(): string {
  const override = import.meta.env.VITE_DOMAIN_CAPABILITIES_MANIFEST_URL?.trim();
  if (override) {
    return override;
  }
  return `${rawBaseUrl()}/data/manifest.json`;
}

export function domainCapabilitiesCatalogUrl(): string {
  const override = import.meta.env.VITE_DOMAIN_CAPABILITIES_CATALOG_URL?.trim();
  if (override) {
    return override;
  }
  return `${rawBaseUrl()}/data/catalog.json`;
}
