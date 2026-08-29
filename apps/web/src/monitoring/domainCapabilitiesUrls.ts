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

export const DOMAIN_CAPABILITIES_REPO_URL = `https://github.com/${repoFromEnv()}`;

/**
 * Parallel mirror URLs for manifest.json.
 * First successful response wins (GitHub raw / jsDelivr / statically.io).
 */
export function domainCapabilitiesManifestUrls(): string[] {
  const override = import.meta.env.VITE_DOMAIN_CAPABILITIES_MANIFEST_URL?.trim();
  if (override) {
    return [override];
  }
  const repo = repoFromEnv();
  const branch = branchFromEnv();
  return [
    `https://raw.githubusercontent.com/${repo}/${branch}/data/manifest.json`,
    `https://cdn.jsdelivr.net/gh/${repo}@${branch}/data/manifest.json`,
    `https://fastly.jsdelivr.net/gh/${repo}@${branch}/data/manifest.json`,
    `https://cdn.statically.io/gh/${repo}/${branch}/data/manifest.json`,
  ];
}

/**
 * Parallel mirror URLs for catalog.json.
 * First successful response wins (GitHub raw / jsDelivr / statically.io).
 */
export function domainCapabilitiesCatalogUrls(): string[] {
  const override = import.meta.env.VITE_DOMAIN_CAPABILITIES_CATALOG_URL?.trim();
  if (override) {
    return [override];
  }
  const repo = repoFromEnv();
  const branch = branchFromEnv();
  return [
    `https://raw.githubusercontent.com/${repo}/${branch}/data/catalog.json`,
    `https://cdn.jsdelivr.net/gh/${repo}@${branch}/data/catalog.json`,
    `https://fastly.jsdelivr.net/gh/${repo}@${branch}/data/catalog.json`,
    `https://cdn.statically.io/gh/${repo}/${branch}/data/catalog.json`,
  ];
}
