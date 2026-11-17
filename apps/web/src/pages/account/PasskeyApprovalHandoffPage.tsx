import { Button, Spinner } from "@okkey/ui";
import { isPasskeyHandoffRequestId } from "@okkey/types";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { createPublicApiClient } from "../../api/client";
import {
  completePasskeyHandoff,
  passkeyApprovalErrorMessageKey,
  rejectPasskeyHandoff,
  type PasskeyApprovalErrorCode,
} from "../../auth/passkeyDeviceApproval";
import { useLocale } from "../../locale/LocaleContext";

type PagePhase = "ready" | "busy" | "done" | "rejected";

/**
 * Guest page opened by the extension. WebAuthn runs here, on the website origin.
 * The request id in the query is single-use and short-lived; the extension polls status separately.
 */
export default function PasskeyApprovalHandoffPage() {
  const { t } = useLocale();
  const [params] = useSearchParams();
  const requestId = params.get("request")?.trim() ?? "";
  const valid = isPasskeyHandoffRequestId(requestId);
  const [phase, setPhase] = useState<PagePhase>("ready");
  const [busyAction, setBusyAction] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<PasskeyApprovalErrorCode | null>(null);

  const onConfirm = () => {
    if (!valid || phase !== "ready") {
      return;
    }
    setPhase("busy");
    setBusyAction("confirm");
    setError(null);
    void (async () => {
      const result = await completePasskeyHandoff(createPublicApiClient(), requestId);
      if (result.ok) {
        setPhase("done");
        return;
      }
      setError(result.code);
      setBusyAction(null);
      setPhase("ready");
    })();
  };

  const onCancel = () => {
    if (!valid || phase !== "ready") {
      return;
    }
    setPhase("busy");
    setBusyAction("cancel");
    setError(null);
    void (async () => {
      try {
        await rejectPasskeyHandoff(createPublicApiClient(), requestId);
        setPhase("rejected");
      } catch {
        setError("failed");
        setBusyAction(null);
        setPhase("ready");
      }
    })();
  };

  return (
    <AppShellLayout
      title={t("web.devicePending.passkeyHandoff.pageTitle")}
      description={valid ? t("web.devicePending.passkeyHandoff.pageBody") : undefined}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <div className="flex w-full flex-col gap-4">
        {!valid ? (
          <p className="text-center text-sm text-muted-foreground" role="status">
            {t("web.devicePending.passkeyHandoff.missing")}
          </p>
        ) : null}

        {valid && phase === "done" ? (
          <p className="text-center text-sm text-muted-foreground" role="status">
            {t("web.devicePending.passkeyHandoff.done")}
          </p>
        ) : null}

        {valid && phase === "rejected" ? (
          <p className="text-center text-sm text-muted-foreground" role="status">
            {t("web.devicePending.passkeyHandoff.rejectedDone")}
          </p>
        ) : null}

        {valid && (phase === "ready" || phase === "busy") ? (
          <div className="flex w-full flex-col gap-3">
            <Button type="button" className="w-full" disabled={phase === "busy"} onClick={onConfirm}>
              {busyAction === "confirm" ? <Spinner data-icon="inline-start" /> : null}
              {busyAction === "confirm"
                ? t("web.devicePending.passkeyBusy")
                : t("web.devicePending.passkeyHandoff.confirm")}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={phase === "busy"} onClick={onCancel}>
              {busyAction === "cancel" ? <Spinner data-icon="inline-start" /> : null}
              {t("web.devicePending.passkeyHandoff.cancel")}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p className="text-center text-sm text-destructive" role="alert">
            {t(passkeyApprovalErrorMessageKey(error))}
          </p>
        ) : null}
      </div>
    </AppShellLayout>
  );
}
