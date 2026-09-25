import {
  canRequestPlanUpgrade,
  normalizePlanTier,
  type PlanCatalogGroup,
  type PlanTier,
} from "@okkey/types";
import type { WebLocale, WebMessageValues } from "@okkey/i18n";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@okkey/ui";
import workspaceTenancyModule from "@okkey-enterprise/workspace-tenancy";
import { CircleHelp, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiRequestError } from "@okkey/api";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import { normalizeAccountProfileWire } from "../../../../auth/normalizeAccountProfileWire";
import { useLocale } from "../../../../locale/LocaleContext";
import { planTierLabel } from "../../../../workspace/planTierLabel";
import {
  detectBrowserRegion,
  normalizeRegionCode,
  type RegionCode,
} from "../../../../regions/regions";
import { getSettingsPopupCacheState } from "../../../settings/settingsPopupCache";
import PlanChangeRequestPopup from "./PlanChangeRequestPopup";
import {
  defaultPlanCatalogGroup,
  planCatalogCardsForGroup,
  type PlanCatalogCard,
  type PlanFeatureRowId,
} from "./planCatalog";
import { settingsSegmentedTabClassName } from "./settingsSegmentedTabClassName";

type WorkspaceSettingsPlanSectionProps = {
  workspaceId: string;
  planTier: string | null | undefined;
  t: (messageKey: string, values?: WebMessageValues) => string;
  canRequest: boolean;
};

function featureLabelKey(featureId: PlanFeatureRowId): string {
  return `web.workspaceSettings.plan.features.${featureId}`;
}

function featureHintKey(featureId: PlanFeatureRowId): string {
  return `web.workspaceSettings.plan.featureHints.${featureId}`;
}

function priceMonthlyKey(tier: PlanTier): string {
  return `web.workspaceSettings.plan.prices.${tier.toLowerCase()}.monthly`;
}

function priceYearlyKey(tier: PlanTier): string {
  return `web.workspaceSettings.plan.prices.${tier.toLowerCase()}.yearly`;
}

function PlanFeatureRow({
  featureId,
  t,
}: {
  featureId: PlanFeatureRowId;
  t: (messageKey: string, values?: WebMessageValues) => string;
}) {
  const label = t(featureLabelKey(featureId));
  // Header-style rows ("Everything in X +" / full functionality) have no tooltip in the Figma design.
  const isInclusionHeader =
    featureId === "everythingInFree" ||
    featureId === "everythingInPremium" ||
    featureId === "fullFunctionality";

  if (isInclusionHeader) {
    return (
      <div className="flex w-full items-center gap-1">
        <p className="min-w-0 flex-1 text-sm leading-5 text-foreground">{label}</p>
      </div>
    );
  }

  const hintKey = featureHintKey(featureId);
  const hint = t(hintKey);

  return (
    <div className="flex w-full items-center gap-1">
      <p className="min-w-0 flex-1 text-sm leading-5 text-foreground">{label}</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={hint}
          >
            <CircleHelp className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{hint}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function PlanCardCta({
  card,
  currentTier,
  canRequest,
  t,
  onConnect,
}: {
  card: PlanCatalogCard;
  currentTier: PlanTier;
  canRequest: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onConnect: () => void;
}) {
  const isCurrent = card.tier === currentTier;
  const canUpgrade = canRequestPlanUpgrade(currentTier, card.tier);

  if (isCurrent) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="h-9 w-full cursor-default"
        disabled
        aria-current="true"
      >
        <Check className="size-4" />
        {t("web.workspaceSettings.plan.cta.current")}
      </Button>
    );
  }

  if (!canUpgrade) {
    return (
      <Button type="button" variant="outline" className="h-9 w-full" disabled>
        {t("web.workspaceSettings.plan.cta.unavailable")}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      className="h-9 w-full"
      disabled={!canRequest}
      onClick={onConnect}
    >
      {t("web.workspaceSettings.plan.cta.connect")}
    </Button>
  );
}

function PlanCard({
  card,
  currentTier,
  canRequest,
  t,
  onConnect,
}: {
  card: PlanCatalogCard;
  currentTier: PlanTier;
  canRequest: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onConnect: () => void;
}) {
  return (
    <article
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-6 overflow-hidden p-4",
        "border-border md:border-l md:first:border-l-0",
        "border-b last:border-b-0 md:border-b-0",
      )}
    >
      {/* Equal-height intro so CTAs line up across cards despite blurb wrap. */}
      <div className="flex flex-col gap-6 md:min-h-[11.5rem]">
        <h3 className="text-center text-sm font-medium leading-5 text-foreground">
          {planTierLabel(card.tier, t)}
        </h3>

        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xl font-medium leading-5 text-foreground">
            {t(priceMonthlyKey(card.tier))}
          </p>
          <p className="w-full text-sm leading-5 text-muted-foreground">
            {card.priceHint === "forever"
              ? t("web.workspaceSettings.plan.priceHints.forever")
              : card.priceHint === "onRequest"
                ? t("web.workspaceSettings.plan.priceHints.onRequest")
                : t(priceYearlyKey(card.tier))}
          </p>
        </div>

        <p className="flex-1 text-center text-sm leading-5 text-muted-foreground">
          {t(`web.workspaceSettings.plan.blurb.${card.tier.toLowerCase()}`)}
        </p>

        <PlanCardCta
          card={card}
          currentTier={currentTier}
          canRequest={canRequest}
          t={t}
          onConnect={onConnect}
        />
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {card.featureRows.map((featureId) => (
          <PlanFeatureRow key={featureId} featureId={featureId} t={t} />
        ))}
      </div>

      {card.yearlyFootnote ? (
        <p className="text-center text-sm leading-5 text-muted-foreground">
          {t("web.workspaceSettings.plan.yearlyFootnote")}
        </p>
      ) : null}
    </article>
  );
}

function resolvePrefillRegion(billingRegion: string | null | undefined): RegionCode {
  return normalizeRegionCode(billingRegion) ?? detectBrowserRegion();
}

export default function WorkspaceSettingsPlanSection({
  workspaceId,
  planTier,
  t,
  canRequest,
}: WorkspaceSettingsPlanSectionProps) {
  const { locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const currentTier = normalizePlanTier(planTier);
  // SaaS (enterprise tenancy overlay) shows personal+business tabs; self-hosted is business-only.
  const showPersonalTab = workspaceTenancyModule.canCreateWorkspace;
  const [group, setGroup] = useState<PlanCatalogGroup>(() =>
    showPersonalTab ? defaultPlanCatalogGroup(planTier) : "business",
  );
  const cards = useMemo(() => planCatalogCardsForGroup(group), [group]);

  const [requestTier, setRequestTier] = useState<PlanTier | null>(null);
  const [profileEmail, setProfileEmail] = useState("");
  const [profileRegion, setProfileRegion] = useState<RegionCode>(() => detectBrowserRegion());
  const [profileLocale, setProfileLocale] = useState<WebLocale>(locale);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!showPersonalTab) {
      setGroup("business");
      return;
    }
    setGroup(defaultPlanCatalogGroup(planTier));
  }, [planTier, showPersonalTab]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cachedProfile = getSettingsPopupCacheState().profile.data;
      if (cachedProfile && !cancelled) {
        setProfileEmail(cachedProfile.email);
        setProfileRegion(resolvePrefillRegion(cachedProfile.billing_region));
        if (cachedProfile.locale === "en" || cachedProfile.locale === "ru") {
          setProfileLocale(cachedProfile.locale);
        }
      }

      if (!core) {
        return;
      }
      try {
        const dto = await core.getAccountProfile();
        if (cancelled) {
          return;
        }
        const normalized = normalizeAccountProfileWire(dto);
        if (!normalized) {
          setProfileRegion((prev) => prev ?? detectBrowserRegion());
          return;
        }
        setProfileEmail(normalized.email);
        setProfileRegion(resolvePrefillRegion(normalized.billing_region));
        if (normalized.locale === "en" || normalized.locale === "ru") {
          setProfileLocale(normalized.locale);
        }
      } catch {
        /* profile autofill is best-effort; form still works */
        if (!cancelled) {
          setProfileRegion((prev) => prev ?? detectBrowserRegion());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core]);

  async function handleSubmit(input: {
    contactEmail: string;
    locale: WebLocale;
    region: RegionCode | null;
  }) {
    if (!requestTier || !core) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await core.requestWorkspacePlanChange(workspaceId, {
        requested_plan_tier: requestTier,
        contact_email: input.contactEmail,
        locale: input.locale,
        region: input.region,
      });
      setSuccess(true);
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : t("web.workspaceSettings.plan.request.errorGeneric");
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-6">
        {showPersonalTab ? (
          <div className="flex w-full min-w-0 items-center justify-center">
            <div
              className="relative flex w-fit max-w-full min-w-0 rounded-lg bg-secondary p-1"
              role="tablist"
              aria-label={t("web.workspaceSettings.plan.tabsAria")}
            >
              {(["personal", "business"] as const).map((value) => {
                const active = group === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    size="sm"
                    variant={active ? "outline" : "ghost"}
                    className={settingsSegmentedTabClassName(active)}
                    onClick={() => setGroup(value)}
                  >
                    <span className="min-w-0 truncate">
                      {t(`web.workspaceSettings.plan.tabs.${value}`)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border md:flex-row">
          {cards.map((card) => (
            <PlanCard
              key={`${group}-${card.tier}`}
              card={card}
              currentTier={currentTier}
              canRequest={canRequest}
              t={t}
              onConnect={() => {
                setRequestTier(card.tier);
                setSuccess(false);
                setSubmitError(null);
              }}
            />
          ))}
        </div>
      </div>

      <PlanChangeRequestPopup
        open={requestTier !== null}
        requestedPlanTier={requestTier ?? "PREMIUM"}
        initialLocale={profileLocale}
        initialRegion={profileRegion}
        initialEmail={profileEmail}
        submitting={submitting}
        errorMessage={submitError}
        success={success}
        t={t}
        onClose={() => {
          if (submitting) {
            return;
          }
          setRequestTier(null);
          setSuccess(false);
          setSubmitError(null);
        }}
        onSubmit={handleSubmit}
      />
    </TooltipProvider>
  );
}
