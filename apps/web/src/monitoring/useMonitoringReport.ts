import { useEffect, useMemo, useState } from "react";
import type { WorkspaceMonitoringCardSettings } from "@okkey/types";
import { DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS } from "@okkey/types";

import { useWorkspaceItems } from "../items/WorkspaceItemsContext";
import { computeMonitoringAnalytics, type MonitoringAnalytics } from "./analytics";
import { findCompromisedItemIds } from "./compromisedPasswords";
import { getCachedDomainCapabilitiesEntries } from "./domainCapabilitiesCache";
import type { DomainCapabilitiesEntries } from "./domainCapabilitiesTypes";
import { extractItemPasswordEntries } from "./extractPasswords";

export type MonitoringReportState = {
  loading: boolean;
  empty: boolean;
  allGood: boolean;
  report: MonitoringAnalytics;
  compromisedChecking: boolean;
};

export type UseMonitoringReportOptions = {
  vaultIds?: ReadonlySet<string>;
  enabledCards?: WorkspaceMonitoringCardSettings;
  catalogEntries?: DomainCapabilitiesEntries | null;
};

const EMPTY_REPORT: MonitoringAnalytics = {
  passwordCount: 0,
  strengthCounts: { strong: 0, medium: 0, weak: 0 },
  strengthPercents: { strong: 0, medium: 0, weak: 0 },
  score: 100,
  scoreLabelKey: "excellent",
  reusedItemIds: [],
  strongItemIds: [],
  mediumItemIds: [],
  weakItemIds: [],
  staleItemIds: [],
  passkeyGapItemIds: [],
  twoFactorGapItemIds: [],
  compromisedItemIds: [],
  analyzedItemIds: [],
};

function filterItemsByVaultIds<T extends { vaultId: string }>(
  items: readonly T[],
  vaultIds: ReadonlySet<string> | undefined,
): readonly T[] {
  if (!vaultIds) {
    return items;
  }
  return items.filter((item) => vaultIds.has(item.vaultId));
}

export function useMonitoringReport(
  _workspaceId: string,
  options: UseMonitoringReportOptions = {},
): MonitoringReportState {
  const { items, bootstrapped, loading: itemsLoading } = useWorkspaceItems();
  const enabledCards = options.enabledCards ?? DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS;
  const catalogEntries = options.catalogEntries;
  const [compromisedItemIds, setCompromisedItemIds] = useState<string[]>([]);
  const [compromisedReady, setCompromisedReady] = useState(false);

  // Stabilize Set identity: callers often pass `new Set(...)` inline each render.
  const vaultIdsKey = useMemo(() => {
    if (!options.vaultIds) {
      return null;
    }
    return [...options.vaultIds].sort().join("\0");
  }, [options.vaultIds]);
  const vaultIds = useMemo(() => {
    if (vaultIdsKey === null) {
      return undefined;
    }
    return new Set(vaultIdsKey.length === 0 ? [] : vaultIdsKey.split("\0"));
  }, [vaultIdsKey]);

  const enabledCardsKey = useMemo(
    () =>
      [
        enabledCards.overall,
        enabledCards.strength,
        enabledCards.reused,
        enabledCards.weak,
        enabledCards.compromised,
        enabledCards.stale,
        enabledCards.passkeyGap,
        enabledCards.twoFactorGap,
      ].map((v) => (v ? "1" : "0")).join(""),
    [enabledCards],
  );
  const stableEnabledCards = useMemo(
    () => enabledCards,
    // Re-bind only when flag bits change (enabledCardsKey), not on object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by enabledCardsKey
    [enabledCardsKey],
  );

  const scopedItems = useMemo(() => filterItemsByVaultIds(items, vaultIds), [items, vaultIds]);

  const passwordEntries = useMemo(() => extractItemPasswordEntries(scopedItems), [scopedItems]);
  const passwordFingerprint = useMemo(
    () => passwordEntries.map((e) => `${e.itemId}\0${e.password}`).join("\n"),
    [passwordEntries],
  );

  const resolvedCatalogEntries = useMemo(() => {
    if (!stableEnabledCards.twoFactorGap) {
      return null;
    }
    return catalogEntries ?? getCachedDomainCapabilitiesEntries();
  }, [catalogEntries, stableEnabledCards.twoFactorGap]);

  const baseReport = useMemo(
    () =>
      computeMonitoringAnalytics(scopedItems, {
        compromisedItemIds: stableEnabledCards.compromised ? compromisedItemIds : [],
        catalogEntries: resolvedCatalogEntries,
        enabledCards: stableEnabledCards,
      }),
    [scopedItems, compromisedItemIds, resolvedCatalogEntries, stableEnabledCards],
  );

  useEffect(() => {
    if (!bootstrapped || itemsLoading) {
      setCompromisedReady(false);
      return;
    }
    if (!stableEnabledCards.compromised) {
      setCompromisedItemIds([]);
      setCompromisedReady(true);
      return;
    }
    if (passwordFingerprint.length === 0) {
      setCompromisedItemIds([]);
      setCompromisedReady(true);
      return;
    }

    let cancelled = false;
    setCompromisedReady(false);
    void findCompromisedItemIds(passwordEntries)
      .then((ids) => {
        if (!cancelled) {
          setCompromisedItemIds(ids);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCompromisedReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
    // `passwordEntries` is read from the render that produced `passwordFingerprint`;
    // do not list the array in deps — a new reference each render would loop setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint gates entry changes
  }, [bootstrapped, itemsLoading, passwordFingerprint, stableEnabledCards.compromised]);

  // Hold skeleton until items + HIBP finish so KPIs do not flash (0 → N).
  const loading = !bootstrapped || itemsLoading || !compromisedReady;
  const empty = bootstrapped && !itemsLoading && passwordEntries.length === 0;
  const issueCount =
    (stableEnabledCards.reused ? baseReport.reusedItemIds.length : 0) +
    (stableEnabledCards.weak ? baseReport.weakItemIds.length : 0) +
    (stableEnabledCards.stale ? baseReport.staleItemIds.length : 0) +
    (stableEnabledCards.compromised ? baseReport.compromisedItemIds.length : 0) +
    (stableEnabledCards.passkeyGap ? baseReport.passkeyGapItemIds.length : 0) +
    (stableEnabledCards.twoFactorGap ? baseReport.twoFactorGapItemIds.length : 0);
  const allGood =
    !loading &&
    !empty &&
    issueCount === 0 &&
    (stableEnabledCards.overall ? baseReport.score >= 90 : issueCount === 0);

  return {
    loading,
    empty,
    allGood,
    report: bootstrapped && compromisedReady ? baseReport : EMPTY_REPORT,
    compromisedChecking: !compromisedReady,
  };
}
