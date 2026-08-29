import {
  Breadcrumb,
  BreadcrumbBar,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  cn,
} from "@okkey/ui";
import type {
  MonitoringCardId,
  Vault,
  Workspace,
  WorkspaceMonitoringCardSettings,
  WorkspacePermissionsMatrixDto,
} from "@okkey/types";
import {
  DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
  MONITORING_CARD_IDS,
  normalizeWorkspacePermissionsMatrix,
  workspaceMonitoringCardSettingsToDto,
} from "@okkey/types";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { CapsuleCheckIcon } from "../../components/capsules/capsuleIcons";
import { BackChevronIcon } from "../../components/items/itemCategoryIcons";
import { stickyHeaderShadowClassName, stickyHeaderSurfaceClassName } from "../../components/workspace/stickyHeaderShadow";
import { workspacePatchFromSettingsResponse } from "../../components/workspace/settings/workspaceSettingsCatalog";
import { GeneralIcon } from "../../components/workspace/settings/workspaceSettingsIcons";
import { useScrollAncestorScrolled } from "../../hooks/useRadixScrollAreaScrolled";
import { useLocale } from "../../locale/LocaleContext";
import {
  FILTER_QUERY_COMPROMISED,
  FILTER_QUERY_MEDIUM,
  FILTER_QUERY_REUSED,
  FILTER_QUERY_STALE,
  FILTER_QUERY_STRONG,
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
} from "../../monitoring/MonitoringCharts";
import { useMonitoringReport } from "../../monitoring/useMonitoringReport";
import { useDomainCapabilitiesCatalog } from "../../monitoring/useDomainCapabilitiesCatalog";
import { DOMAIN_CAPABILITIES_REPO_URL } from "../../monitoring/domainCapabilitiesUrls";

type VaultScopeTab = "all" | "personal" | "shared";

type MonitoringPageProps = {
  workspaceId: string;
  workspaceName: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  workspacePermissions?: WorkspacePermissionsMatrixDto | null;
  patchWorkspace?: (workspaceId: string, patch: Partial<Workspace>) => void;
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
  /** Optional status chip next to the title (e.g. Beta). */
  badgeLabel?: string;
};

const CARD_LABEL_KEYS: Record<MonitoringCardId, string> = {
  overall: "web.monitoring.overallTitle",
  strength: "web.monitoring.strengthTitle",
  reused: "web.monitoring.reusedTitle",
  weak: "web.monitoring.weakTitle",
  compromised: "web.monitoring.compromisedTitle",
  stale: "web.monitoring.staleTitle",
  passkeyGap: "web.monitoring.passkeyGapTitle",
  twoFactorGap: "web.monitoring.twoFactorGapTitle",
};

function IssueCard({
  count,
  title,
  description,
  tone,
  showHref,
  showLabel,
  disabled = false,
  badgeLabel,
}: IssueCardProps) {
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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className={cn("text-sm font-medium", disabled ? "text-muted-foreground" : "text-foreground")}>
            {title}
          </p>
          {badgeLabel ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-xs leading-5 text-muted-foreground">
              {badgeLabel}
            </span>
          ) : null}
        </div>
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
  vaultKind: VaultScopeTab,
): string | null {
  if (count <= 0) {
    return null;
  }
  return itemsPathWithMonitoringFilter(searchParams, filter, {
    vaultKind: vaultKind === "all" ? "all" : vaultKind,
  });
}

function resolveVaultIdsForScope(
  vaults: readonly Vault[],
  scope: VaultScopeTab,
): ReadonlySet<string> | undefined {
  if (scope === "all") {
    return undefined;
  }
  const ids = vaults
    .filter((vault) => (scope === "personal" ? vault.isPersonal : !vault.isPersonal))
    .map((vault) => vault.id);
  return new Set(ids);
}

export default function MonitoringPage({
  workspaceId,
  workspaceName,
  workspace,
  vaults,
  workspacePermissions,
  patchWorkspace,
}: MonitoringPageProps) {
  const { t } = useLocale();
  const core = useAuthenticatedCoreClient();
  const [searchParams] = useSearchParams();
  const itemsHref = itemsPathAllWorkspaceMerged(searchParams);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const headerScrolled = useScrollAncestorScrolled(pageRootRef, 0);
  const [vaultScope, setVaultScope] = useState<VaultScopeTab>("all");
  const [cardSettingsSaving, setCardSettingsSaving] = useState(false);

  const enabledCards = useMemo(
    () => workspace?.monitoringCardSettings ?? DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
    [workspace?.monitoringCardSettings],
  );

  const canConfigureMonitoring = useMemo(() => {
    if (!workspacePermissions) {
      return false;
    }
    return normalizeWorkspacePermissionsMatrix(workspacePermissions).settings.put >= 1;
  }, [workspacePermissions]);

  const vaultIds = useMemo(
    () => resolveVaultIdsForScope(vaults, vaultScope),
    [vaults, vaultScope],
  );

  const { catalog } = useDomainCapabilitiesCatalog(enabledCards.twoFactorGap);
  const { loading, empty, allGood, report } = useMonitoringReport(workspaceId, {
    vaultIds,
    enabledCards,
    catalogEntries: catalog.entries,
  });

  const showLabel = t("web.monitoring.show");

  const vaultScopeOptions: { value: VaultScopeTab; label: string }[] = [
    { value: "all", label: t("web.monitoring.vaultScope.all") },
    { value: "personal", label: t("web.monitoring.vaultScope.personal") },
    { value: "shared", label: t("web.monitoring.vaultScope.shared") },
  ];

  const persistCardSettings = useCallback(
    async (next: WorkspaceMonitoringCardSettings) => {
      if (!core || cardSettingsSaving) {
        return;
      }
      const previous = enabledCards;
      patchWorkspace?.(workspaceId, { monitoringCardSettings: next });
      setCardSettingsSaving(true);
      try {
        const updated = await core.updateWorkspaceSettings(workspaceId, {
          monitoring_card_settings: workspaceMonitoringCardSettingsToDto(next),
        });
        patchWorkspace?.(workspaceId, workspacePatchFromSettingsResponse(updated));
      } catch {
        patchWorkspace?.(workspaceId, { monitoringCardSettings: previous });
      } finally {
        setCardSettingsSaving(false);
      }
    },
    [cardSettingsSaving, core, enabledCards, patchWorkspace, workspaceId],
  );

  const toggleCard = useCallback(
    (cardId: MonitoringCardId) => {
      void persistCardSettings({
        ...enabledCards,
        [cardId]: !enabledCards[cardId],
      });
    },
    [enabledCards, persistCardSettings],
  );

  const showCompromisedFootnote = enabledCards.compromised;
  const showCatalogFootnote = enabledCards.twoFactorGap || enabledCards.passkeyGap;

  return (
    <div ref={pageRootRef} className="flex min-h-full min-w-0 flex-1 flex-col">
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

      <header
        className={cn(
          stickyHeaderSurfaceClassName,
          stickyHeaderShadowClassName(headerScrolled),
          "top-0 box-border flex h-[53px] shrink-0 items-center gap-2 border-b border-border py-2 pl-2 pr-2 md:hidden",
        )}
      >
        <Button asChild variant="secondary" size="iconSm" className="!size-7 !min-h-7 !min-w-7 shrink-0 rounded-md">
          <Link to={itemsHref} aria-label={t("web.monitoring.backAria")}>
            <BackChevronIcon />
          </Link>
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{t("web.monitoring.title")}</p>
      </header>

      <div className="flex flex-1 flex-col items-center px-4 py-6 md:px-6 md:pb-8 md:pt-8">
        <div className="flex w-full max-w-[900px] flex-col gap-9">
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold leading-7 text-foreground">{t("web.monitoring.title")}</h1>
            <p className="text-sm leading-5 text-muted-foreground">{t("web.monitoring.description")}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex w-fit rounded-lg bg-secondary p-1">
              {vaultScopeOptions.map(({ value, label }) => {
                const active = vaultScope === value;
                return (
                  <Button
                    key={value}
                    size="sm"
                    variant={active ? "outline" : "ghost"}
                    className={cn(
                      "relative border",
                      active
                        ? cn(
                            "z-10",
                            "!bg-background hover:!bg-background active:!bg-background",
                            "hover:!border-input focus:!border-input focus-visible:!border-input",
                            "focus:hover:!border-input focus-visible:hover:!border-input",
                            "!shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                            "focus:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                            "focus:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                            "dark:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                            "dark:focus:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                            "dark:focus:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                          )
                        : cn(
                            "z-0 border-transparent shadow-none",
                            "hover:border-transparent hover:bg-foreground/5",
                            "focus:shadow-none focus-visible:shadow-none",
                            "dark:focus:shadow-none dark:focus-visible:shadow-none",
                            "focus:bg-foreground/10 focus-visible:bg-foreground/10",
                            "active:bg-foreground/10",
                          ),
                    )}
                    onClick={() => setVaultScope(value)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>

            {canConfigureMonitoring ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="shrink-0" aria-label={t("web.monitoring.configure")}>
                    <GeneralIcon data-icon="inline-start" className="size-4 shrink-0" />
                    {t("web.monitoring.configure")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56 p-1">
                  <DropdownMenuGroup>
                    {MONITORING_CARD_IDS.map((cardId) => {
                      const checked = enabledCards[cardId];
                      return (
                        <DropdownMenuItem
                          key={cardId}
                          className="gap-2"
                          disabled={cardSettingsSaving}
                          onSelect={(event) => {
                            event.preventDefault();
                            toggleCard(cardId);
                          }}
                        >
                          {checked ? (
                            <CapsuleCheckIcon className="size-4 shrink-0" />
                          ) : (
                            <span className="size-4 shrink-0" aria-hidden />
                          )}
                          <span>{t(CARD_LABEL_KEYS[cardId])}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
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
                {enabledCards.overall ? <ChartCardSkeleton /> : null}
                {enabledCards.strength ? <ChartCardSkeleton /> : null}
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {MONITORING_CARD_IDS.filter(
                  (id) =>
                    id !== "overall" &&
                    id !== "strength" &&
                    enabledCards[id],
                ).map((id) => (
                  <IssueCardSkeleton key={id} />
                ))}
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
                searchParams={searchParams}
                showLabel={showLabel}
                enabledCards={enabledCards}
                vaultScope={vaultScope}
                t={t}
              />
            </>
          ) : null}

          {showCompromisedFootnote || showCatalogFootnote ? (
            <ol className="mb-4 list-decimal space-y-2 ps-5 text-xs leading-5 text-muted-foreground">
              {showCompromisedFootnote ? <li>{t("web.monitoring.compromisedAttribution")}</li> : null}
              {showCatalogFootnote ? (
                <li>
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
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MonitoringDashboard({
  report,
  searchParams,
  showLabel,
  enabledCards,
  vaultScope,
  t,
}: {
  report: MonitoringAnalytics;
  searchParams: URLSearchParams;
  showLabel: string;
  enabledCards: WorkspaceMonitoringCardSettings;
  vaultScope: VaultScopeTab;
  t: (key: string) => string;
}) {
  const donutSegments = [
    { value: report.strengthCounts.strong, className: "stroke-lime-500" },
    { value: report.strengthCounts.medium, className: "stroke-yellow-400" },
    { value: report.strengthCounts.weak, className: "stroke-destructive" },
  ];

  const showChartsRow = enabledCards.overall || enabledCards.strength;

  return (
    <div className="flex flex-col gap-6">
      {showChartsRow ? (
        <div className="flex flex-col gap-6 lg:flex-row">
          {enabledCards.overall ? (
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
          ) : null}

          {enabledCards.strength ? (
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
                <div className="flex flex-col items-start gap-1">
                  <LegendRow
                    colorClass="bg-lime-500"
                    percent={report.strengthPercents.strong}
                    label={t("web.monitoring.strengthStrong")}
                    href={issueHref(searchParams, FILTER_QUERY_STRONG, report.strongItemIds.length, vaultScope)}
                  />
                  <LegendRow
                    colorClass="bg-yellow-400"
                    percent={report.strengthPercents.medium}
                    label={t("web.monitoring.strengthMedium")}
                    href={issueHref(searchParams, FILTER_QUERY_MEDIUM, report.mediumItemIds.length, vaultScope)}
                  />
                  <LegendRow
                    colorClass="bg-destructive"
                    percent={report.strengthPercents.weak}
                    label={t("web.monitoring.strengthWeak")}
                    href={issueHref(searchParams, FILTER_QUERY_WEAK, report.weakItemIds.length, vaultScope)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {enabledCards.reused ? (
          <IssueCard
            count={report.reusedItemIds.length}
            title={t("web.monitoring.reusedTitle")}
            description={t("web.monitoring.reusedDescription")}
            tone={report.reusedItemIds.length > 0 ? "warning" : "success"}
            showHref={issueHref(searchParams, FILTER_QUERY_REUSED, report.reusedItemIds.length, vaultScope)}
            showLabel={showLabel}
          />
        ) : null}
        {enabledCards.weak ? (
          <IssueCard
            count={report.weakItemIds.length}
            title={t("web.monitoring.weakTitle")}
            description={t("web.monitoring.weakDescription")}
            tone={report.weakItemIds.length > 0 ? "danger" : "success"}
            showHref={issueHref(searchParams, FILTER_QUERY_WEAK, report.weakItemIds.length, vaultScope)}
            showLabel={showLabel}
          />
        ) : null}
        {enabledCards.compromised ? (
          <IssueCard
            count={report.compromisedItemIds.length}
            title={t("web.monitoring.compromisedTitle")}
            description={t("web.monitoring.compromisedDescription")}
            tone={report.compromisedItemIds.length > 0 ? "danger" : "success"}
            showHref={issueHref(searchParams, FILTER_QUERY_COMPROMISED, report.compromisedItemIds.length, vaultScope)}
            showLabel={showLabel}
          />
        ) : null}
        {enabledCards.stale ? (
          <IssueCard
            count={report.staleItemIds.length}
            title={t("web.monitoring.staleTitle")}
            description={t("web.monitoring.staleDescription")}
            tone={report.staleItemIds.length > 0 ? "warning" : "success"}
            showHref={issueHref(searchParams, FILTER_QUERY_STALE, report.staleItemIds.length, vaultScope)}
            showLabel={showLabel}
          />
        ) : null}
        {/*
          Passkey gap is intentionally disabled until vault passkeys exist end-to-end.
          Implementation order:
          1) Desktop / browser extension: create & use WebAuthn/FIDO2 credentials (synced software passkeys).
          2) Item schema + login item UI: store passkey credentials on the record card (like Bitwarden fido2Credentials).
          3) Monitoring: compute passkeyGapItemIds from catalog.supportsPasskeys vs empty credentials, then enable this card.
        */}
        {enabledCards.passkeyGap ? (
          <IssueCard
            count={0}
            title={t("web.monitoring.passkeyGapTitle")}
            description={t("web.monitoring.passkeyGapDescription")}
            tone="success"
            showHref={null}
            showLabel={showLabel}
            disabled
          />
        ) : null}
        {enabledCards.twoFactorGap ? (
          <IssueCard
            count={report.twoFactorGapItemIds.length}
            title={t("web.monitoring.twoFactorGapTitle")}
            description={t("web.monitoring.twoFactorGapDescription")}
            tone={report.twoFactorGapItemIds.length > 0 ? "danger" : "success"}
            showHref={issueHref(searchParams, FILTER_QUERY_TWO_FACTOR_GAP, report.twoFactorGapItemIds.length, vaultScope)}
            showLabel={showLabel}
            badgeLabel={t("web.monitoring.betaBadge")}
          />
        ) : null}
      </div>
    </div>
  );
}

function LegendRow({
  colorClass,
  percent,
  label,
  href,
}: {
  colorClass: string;
  percent: number;
  label: string;
  href: string | null;
}) {
  const content = (
    <>
      <span className={cn("size-3 shrink-0 rounded-full", colorClass)} aria-hidden />
      <p className="min-w-0 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{percent}%</span> {label}
      </p>
    </>
  );

  if (!href) {
    return <div className="inline-flex max-w-full items-center gap-2 px-1 py-0.5">{content}</div>;
  }

  return (
    <Link
      to={href}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-sm px-1 py-0.5",
        "text-inherit no-underline",
        "hover:bg-muted",
      )}
    >
      {content}
    </Link>
  );
}
