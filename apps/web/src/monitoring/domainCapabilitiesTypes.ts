export type DomainCapabilityEntry = {
  supports2FA: boolean;
  supportsPasskeys: boolean;
  sources: readonly string[];
};

export type DomainCapabilitiesEntries = Readonly<Record<string, DomainCapabilityEntry>>;

export type DomainCapabilitiesCatalog = {
  version: string;
  generatedAt: string;
  sha256: string;
  entries: DomainCapabilitiesEntries;
};

export type DomainCapabilitiesManifest = {
  version: string;
  generatedAt: string;
  sha256: string;
  entryCount: number;
};

export type DomainCapabilitiesCacheRecord = {
  version: string;
  sha256: string;
  fetchedAt: number;
  entries: DomainCapabilitiesEntries;
};

export type DomainCapabilitiesSource = "cache" | "github" | "baseline";
