import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button } from "@okkey/ui";
import { ApiRequestError } from "@okkey/api";
import type { SVGProps } from "react";
import { useEffect, useState } from "react";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import type { RegionCode } from "../../../../regions/regions";
import { buildLicenseMailto, DEFAULT_LICENSE_SALES_EMAIL } from "./buildLicenseMailto";
import {
  formatLicenseRequestSentAt,
  readLicenseRequestSentAt,
  writeLicenseRequestSentAt,
} from "./licenseRequestSentAtStorage";
import SelfHostedSalesRequestPopup from "./SelfHostedSalesRequestPopup";
import { usePlanRequestProfile } from "./usePlanRequestProfile";

function AlertInfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
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
  /** Kept for PlanSection prop parity; Core self-host UI ignores DB `plan_tier`. */
  planTier: string | null | undefined;
  t: (messageKey: string, values?: WebMessageValues) => string;
  canRequest: boolean;
  /** Workspace display name for auto hidden fields. */
  workspaceName?: string;
};

/**
 * Public Core plan page when enterprise modules are not loaded: FREE notice + sales request.
 * Self-host display is driven by modules (this section mounts only when modules are off),
 * not by workspace `plan_tier`.
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
  const [salesEmail, setSalesEmail] = useState(DEFAULT_LICENSE_SALES_EMAIL);

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
    const href = buildLicenseMailto({
      salesEmail,
      workspaceName,
      workspaceUrl,
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
      openMailto(input);
      markSubmitted(new Date().toISOString());
      setPopupOpen(false);
      setSubmitError(null);
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
        <AlertInfoIcon className="size-4" />
        <AlertTitle>{t("web.workspaceSettings.plan.selfHosted.freeTitle")}</AlertTitle>
        <AlertDescription>
          <p>{t("web.workspaceSettings.plan.selfHosted.freeIntro")}</p>
        </AlertDescription>
      </Alert>

      <Alert variant="info">
        <AlertInfoIcon className="size-4" />
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
