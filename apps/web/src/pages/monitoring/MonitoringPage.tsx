import {
  Breadcrumb,
  BreadcrumbBar,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Skeleton,
  cn,
} from "@okkey/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { BackChevronIcon } from "../../components/items/itemCategoryIcons";
import { stickyHeaderShadowClassName, stickyHeaderSurfaceClassName } from "../../components/workspace/stickyHeaderShadow";
import { useScrollAncestorScrolled } from "../../hooks/useRadixScrollAreaScrolled";
import { useLocale } from "../../locale/LocaleContext";
import {
  FILTER_QUERY_COMPROMISED,
  FILTER_QUERY_REUSED,
  FILTER_QUERY_STALE,
  FILTER_QUERY_TWO_FACTOR_GAP,
  FILTER_QUERY_WEAK,
  ITEMS_PATH,
  itemsPathAllWorkspaceMerged,
  itemsPathWithMonitoringFilter,
  type MonitoringItemsFilter,
} from "../../routes/paths";
import type { MonitoringAnalytics, MonitoringScoreLabelKey } from "../../monitoring/analytics";
import {
  MonitoringDonutChart,
  MonitoringGaugeChart,
  MonitoringTrendChart,
} from "../../monitoring/MonitoringCharts";
import { useMonitoringReport } from "../../monitoring/useMonitoringReport";
import { useDomainCapabilitiesCatalog } from "../../monitoring/useDomainCapabilitiesCatalog";
import { DOMAIN_CAPABILITIES_REPO_URL } from "../../monitoring/domainCapabilitiesUrls";

type MonitoringPageProps = {
  workspaceId: string;
  workspaceName: string;
};

type IssueCardProps = {
  count: number;
  title: string;
  description: string;
  tone: "warning" | "danger" | "success";
  showHref: string | null;
  showLabel: string;
  /** Grayed-out placeholder; no Show link and muted styling. */
  disabled?: boolean;
};

function IssueCard({ count, title, description, tone, showHref, showLabel, disabled = false }: IssueCardProps) {
  const iconWrap = disabled
    ? "bg-muted text-muted-foreground"
    : tone === "success"
      ? "bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-400"
      : tone === "warning"
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
        : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
  const countClass = disabled
    ? "text-muted-foreground"
    : tone === "success"
      ? "text-lime-700 dark:text-lime-400"
      : tone === "warning"
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-destructive";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border p-4",
        disabled && "opacity-60",
      )}
      aria-disabled={disabled || undefined}
    >
      <div className="flex items-center gap-2.5">
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", iconWrap)}>
          {disabled || tone === "success" ? (
            <CheckCircle2 className="size-5" aria-hidden />
          ) : (
            <AlertCircle className="size-5" aria-hidden />
          )}
        </div>
        <p className={cn("min-w-0 flex-1 text-3xl font-bold leading-9", countClass)}>{count}</p>
        {!disabled && showHref && count > 0 ? (
          <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
            <Link to={showHref}>{showLabel}</Link>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className={cn("text-sm font-medium", disabled ? "text-muted-foreground" : "text-foreground")}>
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ChartCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-border p-3">
      <Skeleton className="size-48 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

function IssueCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-9 w-16" />
      </div>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function scoreLabelMessageKey(key: MonitoringScoreLabelKey): string {
  return `web.monitoring.scoreLabels.${key}`;
}

function issueHref(
  searchParams: URLSearchParams,
  filter: MonitoringItemsFilter,
  count: number,
): string | null {
  if (count <= 0) {
    return null;
  }
  return itemsPathWithMonitoringFilter(searchParams, filter);
}

export default function MonitoringPage({ workspaceId, workspaceName }: MonitoringPageProps) {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const itemsHref = itemsPathAllWorkspaceMerged(searchParams);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const headerScrolled = useScrollAncestorScrolled(pageRootRef, 0);
  const { catalog } = useDomainCapabilitiesCatalog(true);
  const { loading, empty, allGood, report, trendPoints } = useMonitoringReport(
    workspaceId,
    catalog.entries,
  );

  const showLabel = t("web.monitoring.show");

  return (
    <div ref={pageRootRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div
        className={cn(
          "sticky top-0 z-20",
          stickyHeaderSurfaceClassName,
          headerScrolled && stickyHeaderShadowClassName,
        )}
      >
        <div className="flex items-center gap-1 border-b border-border px-2 py-2 md:hidden">
          <Link
            to={itemsHref}
            className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
            aria-label={t("web.monitoring.backAria")}
          >
            <BackChevronIcon className="size-5" />
          </Link>
          <p className="truncate text-sm font-medium">{t("web.monitoring.title")}</p>
        </div>
        <BreadcrumbBar className="max-md:hidden">
          <Breadcrumb aria-label={t("web.monitoring.breadcrumbsAria")}>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={itemsHref} title={workspaceName}>
                    <span className="truncate">{workspaceName}</span>
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage title={t("web.monitoring.title")}>{t("web.monitoring.title")}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </BreadcrumbBar>
      </div>

      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 py-8">
        <div className="flex w-full max-w-[900px] flex-col gap-9">
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold leading-7 text-foreground">{t("web.monitoring.title")}</h1>
            <p className="text-sm leading-5 text-muted-foreground">{t("web.monitoring.description")}</p>
          </div>

          {empty ? (
            <div className="flex flex-col items-start gap-4 rounded-xl border border-border p-6">
              <p className="text-base font-medium text-foreground">{t("web.monitoring.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("web.monitoring.emptyDescription")}</p>
              <Button asChild variant="outline">
                <Link to={ITEMS_PATH}>{t("web.monitoring.emptyCta")}</Link>
              </Button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-6 lg:flex-row">
                <ChartCardSkeleton />
                <ChartCardSkeleton />
              </div>
              <div className="rounded-xl border border-border p-4">
                <Skeleton className="mb-3 h-7 w-40" />
                <Skeleton className="h-24 w-full" />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <IssueCardSkeleton />
                <IssueCardSkeleton />
                <IssueCardSkeleton />
                <IssueCardSkeleton />
                <IssueCardSkeleton />
                <IssueCardSkeleton />
              </div>
            </div>
          ) : null}

          {!loading && !empty ? (
            <>
              {allGood ? (
                <div className="flex items-start gap-3 rounded-xl border border-lime-200 bg-lime-50 p-4 dark:border-lime-900 dark:bg-lime-950/40">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-lime-700 dark:text-lime-400" aria-hidden />
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-base font-medium text-foreground">{t("web.monitoring.allGoodTitle")}</p>
                    <p className="text-sm text-muted-foreground">{t("web.monitoring.allGoodDescription")}</p>
                  </div>
                </div>
              ) : null}
              <MonitoringDashboard
                report={report}
                trendPoints={trendPoints}
                searchParams={searchParams}
                showLabel={showLabel}
                t={t}
              />
            </>
          ) : null}

          <p className="mb-4 text-xs leading-5 text-muted-foreground">
            {t("web.monitoring.catalogAttribution")}{" "}
            <a
              href={DOMAIN_CAPABILITIES_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {t("web.monitoring.catalogRepoLink")}
            </a>
            . {t("web.monitoring.catalogUpstreamAttribution")}
          </p>
        </div>
      </main>
    </div>
  );
}

function MonitoringDashboard({
  report,
  trendPoints,
  searchParams,
  showLabel,
  t,
}: {
  report: MonitoringAnalytics;
  trendPoints: { ts: number; score: number }[];
  searchParams: URLSearchParams;
  showLabel: string;
  t: (key: string) => string;
}) {
  const donutSegments = [
    { value: report.strengthCounts.strong, className: "stroke-lime-500" },
    { value: report.strengthCounts.medium, className: "stroke-yellow-400" },
    { value: report.strengthCounts.weak, className: "stroke-destructive" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-border p-3">
          <div className="relative size-48 shrink-0">
            <MonitoringGaugeChart score={report.score} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-bold leading-9 text-foreground">{report.score}/100</p>
              <p className="text-xs text-muted-foreground">{t(scoreLabelMessageKey(report.scoreLabelKey))}</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-lg font-semibold text-foreground">{t("web.monitoring.overallTitle")}</p>
            <p className="text-sm leading-5 text-muted-foreground">{t("web.monitoring.overallDescription")}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-border p-3">
          <div className="relative size-48 shrink-0">
            <MonitoringDonutChart segments={donutSegments} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-bold leading-9 text-foreground">
                {report.passwordCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{t("web.monitoring.passwordsLabel")}</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-lg font-semibold text-foreground">{t("web.monitoring.strengthTitle")}</p>
            <div className="flex flex-col gap-1">
              <LegendRow
                colorClass="bg-lime-500"
                percent={report.strengthPercents.strong}
                label={t("web.monitoring.strengthStrong")}
              />
              <LegendRow
                colorClass="bg-yellow-400"
                percent={report.strengthPercents.medium}
                label={t("web.monitoring.strengthMedium")}
              />
              <LegendRow
                colorClass="bg-destructive"
                percent={report.strengthPercents.weak}
                label={t("web.monitoring.strengthWeak")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="mb-3 text-lg font-semibold text-foreground">{t("web.monitoring.trendTitle")}</p>
        <p className="mb-3 text-sm text-muted-foreground">{t("web.monitoring.trendDescription")}</p>
        <MonitoringTrendChart points={trendPoints} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <IssueCard
          count={report.reusedItemIds.length}
          title={t("web.monitoring.reusedTitle")}
          description={t("web.monitoring.reusedDescription")}
          tone={report.reusedItemIds.length > 0 ? "warning" : "success"}
          showHref={issueHref(searchParams, FILTER_QUERY_REUSED, report.reusedItemIds.length)}
          showLabel={showLabel}
        />
        <IssueCard
          count={report.weakItemIds.length}
          title={t("web.monitoring.weakTitle")}
          description={t("web.monitoring.weakDescription")}
          tone={report.weakItemIds.length > 0 ? "danger" : "success"}
          showHref={issueHref(searchParams, FILTER_QUERY_WEAK, report.weakItemIds.length)}
          showLabel={showLabel}
        />
        <IssueCard
          count={report.compromisedItemIds.length}
          title={t("web.monitoring.compromisedTitle")}
          description={t("web.monitoring.compromisedDescription")}
          tone={report.compromisedItemIds.length > 0 ? "danger" : "success"}
          showHref={issueHref(searchParams, FILTER_QUERY_COMPROMISED, report.compromisedItemIds.length)}
          showLabel={showLabel}
        />
        <IssueCard
          count={report.staleItemIds.length}
          title={t("web.monitoring.staleTitle")}
          description={t("web.monitoring.staleDescription")}
          tone={report.staleItemIds.length > 0 ? "warning" : "success"}
          showHref={issueHref(searchParams, FILTER_QUERY_STALE, report.staleItemIds.length)}
          showLabel={showLabel}
        />
        {/*
          Passkey gap is intentionally disabled until vault passkeys exist end-to-end.
          Implementation order:
          1) Desktop / browser extension: create & use WebAuthn/FIDO2 credentials (synced software passkeys).
          2) Item schema + login item UI: store passkey credentials on the record card (like Bitwarden fido2Credentials).
          3) Monitoring: compute passkeyGapItemIds from catalog.supportsPasskeys vs empty credentials, then enable this card.
        */}
        <IssueCard
          count={0}
          title={t("web.monitoring.passkeyGapTitle")}
          description={t("web.monitoring.passkeyGapDescription")}
          tone="success"
          showHref={null}
          showLabel={showLabel}
          disabled
        />
        <IssueCard
          count={report.twoFactorGapItemIds.length}
          title={t("web.monitoring.twoFactorGapTitle")}
          description={t("web.monitoring.twoFactorGapDescription")}
          tone={report.twoFactorGapItemIds.length > 0 ? "danger" : "success"}
          showHref={issueHref(searchParams, FILTER_QUERY_TWO_FACTOR_GAP, report.twoFactorGapItemIds.length)}
          showLabel={showLabel}
        />
      </div>
    </div>
  );
}

function LegendRow({
  colorClass,
  percent,
  label,
}: {
  colorClass: string;
  percent: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-3 shrink-0 rounded-full", colorClass)} aria-hidden />
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{percent}%</span> {label}
      </p>
    </div>
  );
}
