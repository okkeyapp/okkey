import { useEffect, useRef, useState } from "react";
import {
  generateRecoverySecret,
  initCrypto,
  wrapVaultKeyWithRecoverySecret,
} from "@okkey/crypto";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ControlGroup,
  controlGroupItemGrowClassName,
  Spinner,
} from "@okkey/ui";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";

import { createAuthenticatedCoreClient } from "../api/client";
import AppShellLayout from "../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../components/app-shell/OkkeyLogoMark";
import { RecoveryInfoTriangleIcon } from "../components/settings/RecoveryInfoTriangleIcon";
import { downloadRecoveryKeyPdf } from "../components/settings/recoveryKeyPdf";
import { useLocale } from "../locale/LocaleContext";
import { useAuthVault } from "./AuthVaultContext";
import type { RecoveryKeyGatePhase } from "./recoveryKeyGate";

const RECOVERY_COPY_SUCCESS_MS = 3000;

type ScreenStep = "prompt" | "saving" | "secret";

export default function RecoveryKeyRequiredScreen(props: {
  phase: Extract<RecoveryKeyGatePhase, "required" | "unavailable">;
  /** Wrap exists but export was never acknowledged — mint a new secret to save. */
  needsNewSecret?: boolean;
  onRetryStatus: () => void;
  onEnrolled: () => void;
}) {
  const { phase, needsNewSecret = false, onRetryStatus, onEnrolled } = props;
  const { t } = useLocale();
  const { accessToken, vaultKey } = useAuthVault();
  const [step, setStep] = useState<ScreenStep>(needsNewSecret ? "saving" : "prompt");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoStartedRef = useRef(false);

  async function createKey() {
    if (!accessToken || !vaultKey) {
      setError(t("auth.registration.recovery.errorEnroll"));
      setStep("prompt");
      return;
    }
    setStep("saving");
    setError(null);
    try {
      await initCrypto();
      const nextSecret = await generateRecoverySecret();
      const secretBytes = new TextEncoder().encode(nextSecret);
      const encryptedBlob = await wrapVaultKeyWithRecoverySecret(vaultKey, secretBytes);
      const core = createAuthenticatedCoreClient(accessToken);
      await core.enrollAccountRecoveryKey({ encryptedBlob });
      setSecret(nextSecret);
      setStep("secret");
    } catch (enrollErr) {
      if (import.meta.env.DEV) {
        console.error("[auth/recovery-key-required]", enrollErr);
      }
      setError(t("auth.registration.recovery.errorEnroll"));
      setStep("prompt");
    }
  }

  useEffect(() => {
    if (phase !== "required" || !needsNewSecret || autoStartedRef.current) {
      return;
    }
    autoStartedRef.current = true;
    void createKey();
    // Intentionally only on first required+needsNewSecret mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- createKey closes over latest token/vaultKey
  }, [phase, needsNewSecret]);

  async function ackExport(): Promise<void> {
    if (!accessToken) {
      throw new Error("missing access token");
    }
    const core = createAuthenticatedCoreClient(accessToken);
    await core.ackAccountRecoveryKeyExport();
    setExported(true);
  }

  async function handleCopy() {
    if (!secret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(secret);
      await ackExport();
      setCopied(true);
      window.setTimeout(() => setCopied(false), RECOVERY_COPY_SUCCESS_MS);
      toast.success(t("web.keyForm.copied"));
    } catch {
      setError(t("web.settingsPopup.recovery.error.copyFailed"));
    }
  }

  async function handleDownload() {
    if (!secret) {
      return;
    }
    const toastId = toast.loading(t("web.settingsPopup.recovery.key.creatingPdf"));
    try {
      await downloadRecoveryKeyPdf(secret, {
        title: t("auth.registration.recovery.pdfTitle"),
        description: t("auth.registration.recovery.pdfDescription"),
      });
      await ackExport();
    } catch {
      setError(t("web.settingsPopup.recovery.error.generic"));
    } finally {
      toast.dismiss(toastId);
    }
  }

  if (phase === "unavailable") {
    return (
      <AppShellLayout
        title={t("auth.registration.recovery.title")}
        description={t("auth.recovery.required.statusError")}
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      >
        <div className="flex w-full flex-col gap-6 rounded-xl border border-border bg-background p-4 shadow-sm">
          <Button type="button" className="w-full" onClick={onRetryStatus}>
            {t("auth.registration.recovery.retryEnroll")}
          </Button>
        </div>
      </AppShellLayout>
    );
  }

  if (step === "saving") {
    return (
      <AppShellLayout title={t("auth.registration.recovery.title")} busy>
        <Spinner aria-label={t("auth.registration.recovery.preparing")} />
      </AppShellLayout>
    );
  }

  if (step === "secret" && secret) {
    return (
      <AppShellLayout
        title={t("auth.registration.recovery.title")}
        description={t("auth.registration.recovery.description")}
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      >
        <div
          className="flex w-full flex-col gap-6 rounded-xl border border-border bg-background p-4 shadow-sm"
          data-testid="recovery-key-required"
        >
          {error ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="rounded-lg bg-secondary p-3">
            <p className="truncate font-mono text-sm leading-5 text-foreground" title={secret}>
              {secret}
            </p>
          </div>
          <ControlGroup aria-label={t("web.settingsPopup.recovery.key.actionsAria")}>
            <Button
              type="button"
              variant="outline"
              className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
              onClick={() => void handleCopy()}
            >
              {copied ? <Check className="size-4 shrink-0" aria-hidden /> : <Copy className="size-4 shrink-0" aria-hidden />}
              {copied ? t("web.keyForm.copied") : t("auth.registration.recovery.copy")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
              onClick={() => void handleDownload()}
            >
              <Download className="size-4 shrink-0" />
              {t("auth.registration.recovery.downloadPdf")}
            </Button>
          </ControlGroup>
          <div className="flex items-start gap-1.5">
            <RecoveryInfoTriangleIcon className="mt-0.5" />
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
              {t("auth.registration.recovery.warning")}
            </p>
          </div>
          <Button type="button" className="w-full" onClick={onEnrolled} disabled={!exported}>
            {t("auth.registration.recovery.next")}
          </Button>
        </div>
      </AppShellLayout>
    );
  }

  return (
    <AppShellLayout
      title={t("auth.registration.recovery.title")}
      description={t("auth.recovery.required.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <div
        className="flex w-full flex-col gap-6 rounded-xl border border-border bg-background p-4 shadow-sm"
        data-testid="recovery-key-required"
      >
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="button" className="w-full" onClick={() => void createKey()}>
          {t("auth.recovery.required.create")}
        </Button>
      </div>
    </AppShellLayout>
  );
}
