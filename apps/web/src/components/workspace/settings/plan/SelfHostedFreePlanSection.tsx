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

const FREE_PERMISSION_KEYS = [
  "unlimitedItems",
  "itemCategories",
  "personalVaultOnly",
  "filesInItems",
  "totpImportExport",
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
 * When outbound email is not deliverable (`sales_email_deliverable: false`), the CTA opens
 * a members-only popup, then a prefilled `mailto:` on confirm — same success UI as SMTP.
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

  function openMailto(memberCount: number) {
    const href = buildLicenseMailto({
      salesEmail,
      workspaceName,
      workspaceUrl,
      memberCount,
      region: profile.region,
      locale: profile.locale,
      senderEmail: profile.email,
      replyEmail: profile.email,
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
      openMailto(input.workspaceMemberCount);
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

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Alert variant="info">
        <AlertInfoIcon className="size-4" />
        <AlertTitle>{t("web.workspaceSettings.plan.selfHosted.freeTitle")}</AlertTitle>
        <AlertDescription>
          <p className="mb-3">{t("web.workspaceSettings.plan.selfHosted.freeIntro")}</p>
          <ul className="list-disc space-y-1 pl-5">
            {FREE_PERMISSION_KEYS.map((key) => (
              <li key={key}>
                {t(`web.workspaceSettings.plan.selfHosted.permissions.${key}`)}
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {showSuccess ? (
        <div className="flex flex-col gap-3">
          <Alert variant="info">
            <AlertInfoIcon className="size-4" />
            <AlertTitle>{t("web.workspaceSettings.plan.request.successTitle")}</AlertTitle>
            <AlertDescription>
              <p>{t("web.workspaceSettings.plan.request.successBody")}</p>
              {sentAtLabel ? (
                <p className="mt-2">
                  {t("web.workspaceSettings.plan.request.sentAt", { datetime: sentAtLabel })}
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
          <div>
            <Button type="button" variant="outline" disabled={ctaDisabled} onClick={openRequestPopup}>
              {t("web.workspaceSettings.plan.request.sendAgain")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" disabled={ctaDisabled} onClick={openRequestPopup}>
            {t("web.workspaceSettings.plan.selfHosted.requestCta")}
          </Button>
        </div>
      )}

      <SelfHostedSalesRequestPopup
        open={popupOpen}
        initialLocale={profile.locale}
        initialRegion={profile.region}
        initialEmail={profile.email}
        senderEmail={profile.email}
        workspaceName={workspaceName}
        workspaceUrl={workspaceUrl}
        requireContactEmail={salesEmailDeliverable}
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
