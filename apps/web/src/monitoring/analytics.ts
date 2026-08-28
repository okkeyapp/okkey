import type { ItemPlaintextV2 } from "@okkey/types";

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
  weakItemIds: string[];
  staleItemIds: string[];
  /** Stub until passkey field type exists in item schema. */
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

export function computeMonitoringAnalytics(
  items: readonly ItemPlaintextV2[],
  options: ComputeMonitoringAnalyticsOptions = {},
): MonitoringAnalytics {
  const nowMs = options.nowMs ?? Date.now();
  const entries = extractItemPasswordEntries(items);
  const analyzedItemIds = uniqueIds(entries.map((e) => e.itemId));

  const strengthCounts: Record<MonitoringStrengthBucket, number> = {
    strong: 0,
    medium: 0,
    weak: 0,
  };
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
    if (bucket === "weak") {
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

  const compromisedItemIds = uniqueIds(options.compromisedItemIds ?? []).filter((id) =>
    analyzedItemIds.includes(id),
  );

  const passwordItemIds = new Set(entries.map((e) => e.itemId));
  const twoFactorGapItemIds = computeTwoFactorGapItemIds(items, passwordItemIds, options.catalogEntries);

  const passwordCount = entries.length;
  const score = computeScore({
    passwordCount,
    weakCount: strengthCounts.weak,
    mediumCount: strengthCounts.medium,
    reusedItemCount: uniqueIds(reusedItemIds).length,
    staleItemCount: uniqueIds(staleItemIds).length,
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
    reusedItemIds: uniqueIds(reusedItemIds),
    weakItemIds: uniqueIds(weakItemIds),
    staleItemIds: uniqueIds(staleItemIds),
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
    | "weak"
    | "stale"
    | "compromised"
    | "2fa-gap"
    | "passkey-gap",
): readonly string[] {
  switch (issue) {
    case "reused":
      return report.reusedItemIds;
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
