/**
 * Shared grammar for `ENTERPRISE_MODULES` (core bootstrap).
 *
 * Matches the sibling plugin: decides only whether the plugin is
 * requested / should be loaded. Narrowing to a feature allowlist stays
 * the plugin's job; core keeps the raw env value on config for pass-through.
 *
 * Forms:
 * - unset / empty → not requested
 * - `true` / `1` / `yes` / `all` → requested (full set; narrowing is N/A)
 * - `false` / `0` / `no` / `none` → not requested
 * - comma-separated plan feature ids → requested when at least one known id
 * - unknown tokens → collected for a startup warning; never enable anything extra
 */
import { ENTERPRISE_MODULE_FEATURES, type PlanFeature } from "@okkey/types";

const MODULE_FEATURE_SET: ReadonlySet<string> = new Set(ENTERPRISE_MODULE_FEATURES);

export type EnterpriseModulesEnvParse =
  | { kind: "unset" }
  | { kind: "boolean"; enabled: boolean }
  | {
      kind: "allowlist";
      features: readonly PlanFeature[];
      unknownTokens: readonly string[];
    };

/**
 * Parse `ENTERPRISE_MODULES` into a structured form.
 * Does not enable entitlements; callers use {@link isEnterpriseModulesRequested}.
 */
export function parseEnterpriseModulesEnv(raw: string | undefined): EnterpriseModulesEnvParse {
  if (raw === undefined) {
    return { kind: "unset" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: "unset" };
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "all") {
    return { kind: "boolean", enabled: true };
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "none") {
    return { kind: "boolean", enabled: false };
  }
  const features: PlanFeature[] = [];
  const unknownTokens: string[] = [];
  const seen = new Set<string>();
  const seenUnknown = new Set<string>();
  for (const part of trimmed.split(",")) {
    const id = part.trim();
    if (!id) {
      continue;
    }
    if (MODULE_FEATURE_SET.has(id)) {
      if (!seen.has(id)) {
        seen.add(id);
        features.push(id as PlanFeature);
      }
      continue;
    }
    if (!seenUnknown.has(id)) {
      seenUnknown.add(id);
      unknownTokens.push(id);
    }
  }
  return { kind: "allowlist", features, unknownTokens };
}

/**
 * Whether core should attempt to load the sibling enterprise plugin.
 * `true` / `all` / non-empty known allowlist → requested.
 * Empty / false / 0 / unset / allowlist of only unknown tokens → not requested.
 */
export function isEnterpriseModulesRequested(parsed: EnterpriseModulesEnvParse): boolean {
  if (parsed.kind === "boolean") {
    return parsed.enabled;
  }
  if (parsed.kind === "allowlist") {
    return parsed.features.length > 0;
  }
  return false;
}

/** Unknown tokens from an allowlist parse (empty for boolean / unset). */
export function enterpriseModulesUnknownTokens(
  parsed: EnterpriseModulesEnvParse,
): readonly string[] {
  return parsed.kind === "allowlist" ? parsed.unknownTokens : [];
}
