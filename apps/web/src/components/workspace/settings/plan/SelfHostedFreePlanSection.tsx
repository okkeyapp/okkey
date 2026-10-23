import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button } from "@okkey/ui";
import { ApiRequestError } from "@okkey/api";
import type { SVGProps } from "react";
import { useState } from "react";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import type { RegionCode } from "../../../../regions/regions";
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
  /** Display tier from entitlements (FREE on self-host without paid license). */
  planTier: string | null | undefined;
  t: (messageKey: string, values?: WebMessageValues) => string;
  canRequest: boolean;
};

/**
 * Self-hosted FREE plan page: notice + sales request.
 * Mounts when modules are off, or when modules are on but display tier is still FREE.
 */
export default function SelfHostedFreePlanSection({
  workspaceId,
  t,
  canRequest,
}: SelfHostedFreePlanSectionProps) {
  const core = useAuthenticatedCoreClient();
  const profile = usePlanRequestProfile();

  const [popupOpen, setPopupOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(input: {
    contactEmail: string;
    locale: "en" | "ru";
    region: RegionCode | null;
    workspaceMemberCount: number;
  }) {
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

      <div>
        <Button
          type="button"
          disabled={!canRequest}
          onClick={() => {
            setPopupOpen(true);
            setSuccess(false);
            setSubmitError(null);
          }}
        >
          {t("web.workspaceSettings.plan.selfHosted.requestCta")}
        </Button>
      </div>

      <SelfHostedSalesRequestPopup
        open={popupOpen}
        initialLocale={profile.locale}
        initialRegion={profile.region}
        initialEmail={profile.email}
        submitting={submitting}
        errorMessage={submitError}
        success={success}
        t={t}
        onClose={() => {
          if (submitting) {
            return;
          }
          setPopupOpen(false);
          setSuccess(false);
          setSubmitError(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
