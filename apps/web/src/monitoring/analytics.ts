import type { ItemPlaintextV2, WorkspaceMonitoringCardSettings } from "@okkey/types";
import { DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS } from "@okkey/types";

import {
  getPasswordStrength,
  toMonitoringStrengthBucket,
  type MonitoringStrengthBucket,
} from "../lib/passwordStrength.js";
import type { DomainCapabilitiesEntries } from "./domainCapabilitiesTypes.js";
import { extractItemDomains, itemHasConfiguredTotp } from "./extractItemDomains.js";
import { extractItemPasswordEntries } from "./extractPasswords.js";

export const STALE_PASSWORD_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type MonitoringScoreLabelKey = "excellent" | "good" | "fair" | "poor";

export type MonitoringAnalytics = {
  passwordCount: number;
  strengthCounts: Record<MonitoringStrengthBucket, number>;
  strengthPercents: Record<MonitoringStrengthBucket, number>;
  score: number;
  scoreLabelKey: MonitoringScoreLabelKey;
  reusedItemIds: string[];
  strongItemIds: string[];
  mediumItemIds: string[];
  weakItemIds: string[];
  staleItemIds: string[];
  /**
   * Always empty until vault passkeys ship end-to-end.
   * Order: (1) desktop/browser WebAuthn create+use, (2) passkey field on login item UI,
   * (3) compute gap here from catalog.supportsPasskeys vs stored credentials.
   */
  passkeyGapItemIds: string[];
  twoFactorGapItemIds: string[];
  compromisedItemIds: string[];
  analyzedItemIds: string[];
};

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function percent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 1000) / 10;
}

function scoreLabelKey(score: number): MonitoringScoreLabelKey {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 45) return "fair";
  return "poor";
}

function computeScore(input: {
  passwordCount: number;
  weakCount: number;
  mediumCount: number;
  reusedItemCount: number;
  staleItemCount: number;
  compromisedItemCount: number;
}): number {
  if (input.passwordCount === 0) {
    return 100;
  }
  const weakRatio = input.weakCount / input.passwordCount;
  const mediumRatio = input.mediumCount / input.passwordCount;
  const reusedRatio = input.reusedItemCount / input.passwordCount;
  const staleRatio = input.staleItemCount / input.passwordCount;
  const compromisedRatio = input.compromisedItemCount / input.passwordCount;

  let score = 100;
  score -= weakRatio * 40;
  score -= mediumRatio * 15;
  score -= reusedRatio * 25;
  score -= staleRatio * 15;
  score -= compromisedRatio * 35;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export type ComputeMonitoringAnalyticsOptions = {
  nowMs?: number;
  /** When set, only items whose vaultId is in the set are analyzed. */
  vaultIds?: ReadonlySet<string>;
  /** Per-card feature toggles; disabled cards omit score penalties and issue lists. */
  enabledCards?: WorkspaceMonitoringCardSettings;
  /** Item ids already known to be compromised (from async HIBP check). */
  compromisedItemIds?: readonly string[];
  /** Domain capability catalog entries (2FA / passkeys). */
  catalogEntries?: DomainCapabilitiesEntries | null;
};

function computeTwoFactorGapItemIds(
  items: readonly ItemPlaintextV2[],
  passwordItemIds: ReadonlySet<string>,
  catalogEntries: DomainCapabilitiesEntries | null | undefined,
): string[] {
  if (!catalogEntries || Object.keys(catalogEntries).length === 0) {
    return [];
  }
  const gapIds: string[] = [];
  for (const item of items) {
    if (item.deleted || item.archived || !passwordItemIds.has(item.itemId)) {
      continue;
    }
    if (itemHasConfiguredTotp(item)) {
      continue;
    }
    const domains = extractItemDomains(item);
    const has2FaCapableDomain = domains.some((domain) => catalogEntries[domain]?.supports2FA === true);
    if (has2FaCapableDomain) {
      gapIds.push(item.itemId);
    }
  }
  return uniqueIds(gapIds);
}

function filterItemsByVaultIds(
  items: readonly ItemPlaintextV2[],
  vaultIds: ReadonlySet<string> | undefined,
): readonly ItemPlaintextV2[] {
  if (!vaultIds) {
    return items;
  }
  return items.filter((item) => vaultIds.has(item.vaultId));
}

export function computeMonitoringAnalytics(
  items: readonly ItemPlaintextV2[],
  options: ComputeMonitoringAnalyticsOptions = {},
): MonitoringAnalytics {
  const nowMs = options.nowMs ?? Date.now();
  const enabled = options.enabledCards ?? DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS;
  const scopedItems = filterItemsByVaultIds(items, options.vaultIds);
  const entries = extractItemPasswordEntries(scopedItems);
  const analyzedItemIds = uniqueIds(entries.map((e) => e.itemId));

  const strengthCounts: Record<MonitoringStrengthBucket, number> = {
    strong: 0,
    medium: 0,
    weak: 0,
  };
  const strongItemIds: string[] = [];
  const mediumItemIds: string[] = [];
  const weakItemIds: string[] = [];
  const staleItemIds: string[] = [];
  const passwordsByValue = new Map<string, string[]>();

  for (const entry of entries) {
    const strength = getPasswordStrength(entry.password);
    if (!strength) {
      continue;
    }
    const bucket = toMonitoringStrengthBucket(strength.labelKey);
    strengthCounts[bucket] += 1;
    if (bucket === "strong") {
      strongItemIds.push(entry.itemId);
    } else if (bucket === "medium") {
      mediumItemIds.push(entry.itemId);
    } else {
      weakItemIds.push(entry.itemId);
    }
    if (nowMs - entry.updatedAtMs >= STALE_PASSWORD_AGE_MS) {
      staleItemIds.push(entry.itemId);
    }
    const group = passwordsByValue.get(entry.password);
    if (group) {
      group.push(entry.itemId);
    } else {
      passwordsByValue.set(entry.password, [entry.itemId]);
    }
  }

  const reusedItemIds: string[] = [];
  for (const group of passwordsByValue.values()) {
    const unique = uniqueIds(group);
    if (unique.length > 1) {
      reusedItemIds.push(...unique);
    }
  }

  const compromisedItemIds = enabled.compromised
    ? uniqueIds(options.compromisedItemIds ?? []).filter((id) => analyzedItemIds.includes(id))
    : [];

  const passwordItemIds = new Set(entries.map((e) => e.itemId));
  const twoFactorGapItemIds = enabled.twoFactorGap
    ? computeTwoFactorGapItemIds(scopedItems, passwordItemIds, options.catalogEntries)
    : [];

  const passwordCount = entries.length;
  const score = computeScore({
    passwordCount,
    weakCount: enabled.weak ? strengthCounts.weak : 0,
    mediumCount: enabled.strength ? strengthCounts.medium : 0,
    reusedItemCount: enabled.reused ? uniqueIds(reusedItemIds).length : 0,
    staleItemCount: enabled.stale ? uniqueIds(staleItemIds).length : 0,
    compromisedItemCount: compromisedItemIds.length,
  });

  return {
    passwordCount,
    strengthCounts,
    strengthPercents: {
      strong: percent(strengthCounts.strong, passwordCount),
      medium: percent(strengthCounts.medium, passwordCount),
      weak: percent(strengthCounts.weak, passwordCount),
    },
    score,
    scoreLabelKey: scoreLabelKey(score),
    reusedItemIds: enabled.reused ? uniqueIds(reusedItemIds) : [],
    strongItemIds: uniqueIds(strongItemIds),
    mediumItemIds: uniqueIds(mediumItemIds),
    weakItemIds: enabled.weak ? uniqueIds(weakItemIds) : [],
    staleItemIds: enabled.stale ? uniqueIds(staleItemIds) : [],
    // Always [] until: (1) desktop/browser WebAuthn, (2) passkey on login item UI, (3) gap analytics here.
    passkeyGapItemIds: [],
    twoFactorGapItemIds,
    compromisedItemIds,
    analyzedItemIds,
  };
}

export function monitoringIssueItemIds(
  report: MonitoringAnalytics,
  issue:
    | "reused"
    | "strong"
    | "medium"
    | "weak"
    | "stale"
    | "compromised"
    | "2fa-gap"
    | "passkey-gap",
): readonly string[] {
  switch (issue) {
    case "reused":
      return report.reusedItemIds;
    case "strong":
      return report.strongItemIds;
    case "medium":
      return report.mediumItemIds;
    case "weak":
      return report.weakItemIds;
    case "stale":
      return report.staleItemIds;
    case "compromised":
      return report.compromisedItemIds;
    case "2fa-gap":
      return report.twoFactorGapItemIds;
    case "passkey-gap":
      return report.passkeyGapItemIds;
    default: {
      const _ex: never = issue;
      return _ex;
    }
  }
}
