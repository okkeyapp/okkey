import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button } from "@okkey/ui";
import { ApiRequestError } from "@okkey/api";
import type { SVGProps } from "react";
import { useEffect, useState } from "react";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import type { RegionCode } from "../../../../regions/regions";
import { buildLicenseMailto } from "./buildLicenseMailto";
import {
  formatLicenseRequestSentAt,
  readLicenseRequestSentAt,
  writeLicenseRequestSentAt,
} from "./licenseRequestSentAtStorage";
import SelfHostedSalesRequestPopup from "./SelfHostedSalesRequestPopup";
import { usePlanRequestProfile } from "./usePlanRequestProfile";

/** Checkmark-in-circle for FREE current-plan Note alert. */
function PlanCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M14.6673 7.38723V8.00056C14.6665 9.43818 14.201 10.837 13.3402 11.9884C12.4794 13.1399 11.2695 13.9822 9.89089 14.3898C8.51227 14.7974 7.03882 14.7485 5.6903 14.2503C4.34177 13.7521 3.19042 12.8313 2.40796 11.6253C1.6255 10.4193 1.25385 8.9926 1.34844 7.5581C1.44303 6.1236 1.99879 4.75811 2.93284 3.66528C3.86689 2.57244 5.12917 1.81082 6.53144 1.49399C7.93371 1.17717 9.40083 1.32212 10.714 1.90723M6.00065 7.33382L8.00065 9.33382L14.6673 2.66715"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Building for Enterprise Info alert (upsell on FREE). */
function PlanBuildingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path d="M2 14H14" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
      <path d="M6 5.3335H6.66667" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
      <path d="M6 8H6.66667" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
      <path
        d="M6 10.6665H6.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M9.33337 5.3335H10"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path d="M9.33337 8H10" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
      <path
        d="M9.33337 10.6665H10"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M3.33337 14V3.33333C3.33337 2.97971 3.47385 2.64057 3.7239 2.39052C3.97395 2.14048 4.31309 2 4.66671 2H11.3334C11.687 2 12.0261 2.14048 12.2762 2.39052C12.5262 2.64057 12.6667 2.97971 12.6667 3.33333V14"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </svg>
  );
}

/** Top enterprise marketing features for the self-host upsell list. */
const ENTERPRISE_FEATURE_KEYS = [
  "unlimitedMembers",
  "unlimitedSharedVaults",
  "unlimitedStorage",
  "customRoles",
  "customProfiles",
  "prioritySupport",
] as const;

/** Default upgrade target for self-hosted FREE sales inquiries (no plan picker). */
const SELF_HOSTED_SALES_REQUEST_TIER = "ENTERPRISE" as const;

type SelfHostedFreePlanSectionProps = {
  workspaceId: string;
  /** Display tier from entitlements (FREE on self-host without paid license). */
  planTier: string | null | undefined;
  t: (messageKey: string, values?: WebMessageValues) => string;
  canRequest: boolean;
  /** Workspace display name for auto hidden fields. */
  workspaceName?: string;
};

/**
 * Self-hosted FREE plan page: notice + sales request.
 * Mounts when modules are off, or when modules are on but display tier is still FREE.
 *
 * Same popup for SMTP and mailto (reply email + members + hidden autos). Delivery only:
 * API send when `sales_email_deliverable`, else prefilled `mailto:` with identical copy.
 */
export default function SelfHostedFreePlanSection({
  workspaceId,
  t,
  canRequest,
  workspaceName = "",
}: SelfHostedFreePlanSectionProps) {
  const core = useAuthenticatedCoreClient();
  const profile = usePlanRequestProfile();

  const [popupOpen, setPopupOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** ISO timestamp of last successful submit (SMTP API or mailto confirm). */
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  /** Prefer mailto until status confirms a real transport (avoids logger fake success). */
  const [salesEmailDeliverable, setSalesEmailDeliverable] = useState(false);
  /** From API `sales_email` only — no client-side default inbox. */
  const [salesEmail, setSalesEmail] = useState("");

  const workspaceUrl =
    typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";

  useEffect(() => {
    let cancelled = false;
    setStatusReady(false);
    void (async () => {
      if (!core) {
        if (!cancelled) {
          setSalesEmailDeliverable(false);
          setSentAt(readLicenseRequestSentAt(workspaceId));
          setStatusReady(true);
        }
        return;
      }
      try {
        const status = await core.getWorkspacePlanChangeRequestStatus(workspaceId);
        if (!cancelled) {
          setSalesEmailDeliverable(status.sales_email_deliverable === true);
          const inbox = (status.sales_email ?? "").trim();
          if (inbox) {
            setSalesEmail(inbox);
          }
          if (status.sales_email_deliverable === true && status.submitted && status.sent_at) {
            setSentAt(status.sent_at);
          } else if (status.sales_email_deliverable !== true) {
            setSentAt(readLicenseRequestSentAt(workspaceId));
          } else {
            setSentAt(null);
          }
        }
      } catch {
        /* best-effort; mailto fallback when status unknown */
        if (!cancelled) {
          setSalesEmailDeliverable(false);
          setSentAt(readLicenseRequestSentAt(workspaceId));
        }
      } finally {
        if (!cancelled) {
          setStatusReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, workspaceId]);

  function openRequestPopup() {
    setPopupOpen(true);
    setSubmitError(null);
  }

  function markSubmitted(iso: string) {
    setSentAt(iso);
    if (!salesEmailDeliverable) {
      writeLicenseRequestSentAt(workspaceId, iso);
    }
  }

  function openMailto(input: {
    contactEmail: string;
    locale: "en" | "ru";
    region: RegionCode | null;
    workspaceMemberCount: number;
  }) {
    if (!salesEmail.trim()) {
      throw new Error(t("web.workspaceSettings.plan.request.errorGeneric"));
    }
    const href = buildLicenseMailto({
      salesEmail,
      workspaceName,
      workspaceUrl,
      // Self-hosted FREE surface: UI is FREE; sales request targets ENTERPRISE.
      currentPlanTier: "FREE",
      requestedPlanTier: SELF_HOSTED_SALES_REQUEST_TIER,
      deploymentMode: "self-hosted",
      memberCount: input.workspaceMemberCount,
      region: input.region ?? profile.region,
      locale: input.locale,
      emailLocale: input.locale,
      senderEmail: profile.email,
      replyEmail: input.contactEmail,
    });
    window.location.href = href;
  }

  async function handleSubmit(input: {
    contactEmail: string;
    locale: "en" | "ru";
    region: RegionCode | null;
    workspaceMemberCount: number;
  }) {
    if (!salesEmailDeliverable) {
      try {
        openMailto(input);
        markSubmitted(new Date().toISOString());
        setPopupOpen(false);
        setSubmitError(null);
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : t("web.workspaceSettings.plan.request.errorGeneric"),
        );
      }
      return;
    }

    if (!core) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await core.requestWorkspacePlanChange(workspaceId, {
        requested_plan_tier: SELF_HOSTED_SALES_REQUEST_TIER,
        contact_email: input.contactEmail,
        locale: input.locale,
        region: input.region,
        workspace_member_count: input.workspaceMemberCount,
      });
      markSubmitted(new Date().toISOString());
      setPopupOpen(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.body.error === "ALREADY_SUBMITTED") {
        // Legacy servers may still reject re-send; show success and keep form usable after refresh.
        markSubmitted(sentAt ?? new Date().toISOString());
        setPopupOpen(false);
        setSubmitError(null);
        return;
      }
      const message =
        error instanceof ApiRequestError
          ? error.message
          : t("web.workspaceSettings.plan.request.errorGeneric");
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const showSuccess = sentAt != null;
  const ctaDisabled = !canRequest || !statusReady;
  const sentAtLabel =
    sentAt != null ? formatLicenseRequestSentAt(sentAt, profile.locale) : "";
  const statusText = showSuccess
    ? t("web.workspaceSettings.plan.selfHosted.requestStatusSent", { datetime: sentAtLabel })
    : t("web.workspaceSettings.plan.selfHosted.requestStatusIdle");
  const ctaLabel = showSuccess
    ? t("web.workspaceSettings.plan.request.sendAgain")
    : t("web.workspaceSettings.plan.selfHosted.requestCta");

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Alert variant="default">
        <PlanCheckIcon className="size-4 shrink-0" />
        <AlertTitle>{t("web.workspaceSettings.plan.selfHosted.freeTitle")}</AlertTitle>
        <AlertDescription>
          <p>{t("web.workspaceSettings.plan.selfHosted.freeIntro")}</p>
        </AlertDescription>
      </Alert>

      <Alert variant="info">
        <PlanBuildingIcon className="size-4 shrink-0" />
        <AlertTitle>{t("plan.enterprise")}</AlertTitle>
        <AlertDescription>
          <p className="mb-3">{t("web.workspaceSettings.plan.selfHosted.enterpriseUpsellIntro")}</p>
          <ul className="mb-3 list-disc space-y-1 pl-5">
            {ENTERPRISE_FEATURE_KEYS.map((key) => (
              <li key={key}>
                {t(`web.workspaceSettings.plan.selfHosted.enterpriseFeatures.${key}`)}
              </li>
            ))}
            <li>{t("web.workspaceSettings.plan.selfHosted.enterpriseFeatures.andMore")}</li>
          </ul>
          <p className="mb-3">{statusText}</p>
          <Button type="button" disabled={ctaDisabled} onClick={openRequestPopup}>
            {ctaLabel}
          </Button>
        </AlertDescription>
      </Alert>

      <SelfHostedSalesRequestPopup
        open={popupOpen}
        initialLocale={profile.locale}
        initialRegion={profile.region}
        initialEmail={profile.email}
        senderEmail={profile.email}
        workspaceName={workspaceName}
        workspaceUrl={workspaceUrl}
        submitting={submitting}
        errorMessage={submitError}
        t={t}
        onClose={() => {
          if (submitting) {
            return;
          }
          setPopupOpen(false);
          setSubmitError(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
