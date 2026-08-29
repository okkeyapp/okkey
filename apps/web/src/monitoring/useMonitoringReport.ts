import { useEffect, useMemo, useState } from "react";

import { useWorkspaceItems } from "../items/WorkspaceItemsContext";
import { computeMonitoringAnalytics, type MonitoringAnalytics } from "./analytics";
import { findCompromisedItemIds } from "./compromisedPasswords";
import { getCachedDomainCapabilitiesEntries } from "./domainCapabilitiesCache";
import type { DomainCapabilitiesEntries } from "./domainCapabilitiesTypes";
import { extractItemPasswordEntries } from "./extractPasswords";
import {
  loadScoreHistory,
  recordScoreSnapshot,
  scoreHistoryForDays,
  type ScoreSnapshot,
} from "./scoreHistory";

export type MonitoringReportState = {
  loading: boolean;
  empty: boolean;
  allGood: boolean;
  report: MonitoringAnalytics;
  trendPoints: ScoreSnapshot[];
  compromisedChecking: boolean;
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

export function useMonitoringReport(
  workspaceId: string,
  catalogEntries?: DomainCapabilitiesEntries | null,
): MonitoringReportState {
  const { items, bootstrapped, loading: itemsLoading } = useWorkspaceItems();
  const [compromisedItemIds, setCompromisedItemIds] = useState<string[]>([]);
  const [compromisedReady, setCompromisedReady] = useState(false);
  const [trendPoints, setTrendPoints] = useState<ScoreSnapshot[]>(() => loadScoreHistory(workspaceId));

  const passwordEntries = useMemo(() => extractItemPasswordEntries(items), [items]);
  const passwordFingerprint = useMemo(
    () => passwordEntries.map((e) => `${e.itemId}\0${e.password}`).join("\n"),
    [passwordEntries],
  );

  const resolvedCatalogEntries = useMemo(
    () => catalogEntries ?? getCachedDomainCapabilitiesEntries(),
    [catalogEntries],
  );

  const baseReport = useMemo(
    () =>
      computeMonitoringAnalytics(items, {
        compromisedItemIds,
        catalogEntries: resolvedCatalogEntries,
      }),
    [items, compromisedItemIds, resolvedCatalogEntries],
  );

  useEffect(() => {
    setTrendPoints(loadScoreHistory(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (!bootstrapped || itemsLoading) {
      setCompromisedReady(false);
      return;
    }
    if (passwordEntries.length === 0) {
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
  }, [bootstrapped, itemsLoading, passwordFingerprint, passwordEntries]);

  useEffect(() => {
    if (!bootstrapped || itemsLoading || !compromisedReady) {
      return;
    }
    if (passwordEntries.length === 0) {
      return;
    }
    const next = recordScoreSnapshot(workspaceId, baseReport.score);
    setTrendPoints(scoreHistoryForDays(next, 90));
  }, [
    baseReport.score,
    bootstrapped,
    compromisedReady,
    itemsLoading,
    passwordEntries.length,
    workspaceId,
  ]);

  // Hold skeleton until items + HIBP finish so KPIs do not flash (0 → N).
  const loading = !bootstrapped || itemsLoading || !compromisedReady;
  const empty = bootstrapped && !itemsLoading && passwordEntries.length === 0;
  const issueCount =
    baseReport.reusedItemIds.length +
    baseReport.weakItemIds.length +
    baseReport.staleItemIds.length +
    baseReport.compromisedItemIds.length +
    baseReport.passkeyGapItemIds.length +
    baseReport.twoFactorGapItemIds.length;
  const allGood = !loading && !empty && issueCount === 0 && baseReport.score >= 90;

  return {
    loading,
    empty,
    allGood,
    report: bootstrapped && compromisedReady ? baseReport : EMPTY_REPORT,
    trendPoints,
    compromisedChecking: !compromisedReady,
  };
}
