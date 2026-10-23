import { useEffect, useMemo, useRef, useState, type FormEvent, type SVGProps } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildRegistrationCryptoArtifacts,
  ed25519Keypair,
  generateRecoverySecret,
  initCrypto,
  registrationArtifactsToWire,
  wipeBytes,
  wrapVaultKeyWithRecoverySecret,
} from "@okkey/crypto";
import type { RegisterCompleteRequestDto } from "@okkey/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ControlGroup,
  controlGroupItemGrowClassName,
  Input,
  Spinner,
} from "@okkey/ui";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { downloadRecoveryKeyPdf } from "../../components/settings/recoveryKeyPdf";
import { RecoveryInfoTriangleIcon } from "../../components/settings/RecoveryInfoTriangleIcon";
import { createAuthenticatedCoreClient } from "../../api/client";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { finalizePendingVaultBundle } from "../../auth/localVaultBundle";
import { bytesToBase64 } from "../../auth/base64";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { parseBrowserEnvironment } from "../../auth/browserEnvironment";
import { DEVICE_PUBLIC_KEY_KEY } from "../../auth/storageKeys";
import { useLocale } from "../../locale/LocaleContext";
import { AUTH_EMAIL_PATH } from "../../routes/paths";
import { writeLastLoginMethodHint } from "../../auth/loginMethodStorage";
import { completeExtensionAuthHandoffIfPending } from "../../auth/completeExtensionAuthHandoff";
import { registrationErrorI18nKey } from "./registrationErrors";
import {
  registrationStepAfterRecoveryEnroll,
  shouldRedirectAwayFromRegistrationForm,
  type RegistrationStep,
} from "./registrationRecoveryStep";

const MIN_MASTER_PASSWORD_LENGTH = 4;
/** Match KeyField copy-success feedback duration. */
const RECOVERY_COPY_SUCCESS_MS = 3000;

function RequirementCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RequirementCrossIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export default function AuthRegistrationPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const {
    authClient,
    registrationAuthStateId,
    profile,
    saveVaultBundle,
    updateLocalProfile,
    setRegistrationAuthStateId,
    clearEmailLoginFlow,
    logout,
    accessToken,
  } = useAuthVault();

  const email = profile?.email ?? "";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [repeatMasterPassword, setRepeatMasterPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<RegistrationStep>("form");
  const [recoverySecret, setRecoverySecret] = useState<string | null>(null);
  const [recoveryExported, setRecoveryExported] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const recoveryCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dedupes Copy/Download ack; bootstrap token is revoked after the first success. */
  const recoveryAckedRef = useRef(false);
  const recoveryAckInFlightRef = useRef<Promise<void> | null>(null);
  /** Held only until recovery enroll succeeds; wiped on success or unmount. */
  const vaultKeyPendingEnrollRef = useRef<Uint8Array | null>(null);
  const [postRegRedirect, setPostRegRedirect] = useState<string | null>(null);
  const [postRegAccessToken, setPostRegAccessToken] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (recoveryCopyResetTimeoutRef.current) {
        clearTimeout(recoveryCopyResetTimeoutRef.current);
      }
      if (vaultKeyPendingEnrollRef.current) {
        wipeBytes(vaultKeyPendingEnrollRef.current);
        vaultKeyPendingEnrollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // After completeRegistration we clear registrationAuthStateId and await enroll.
    // Guard must keep `enrolling` / `enrollFailed` / `recoveryKey` on this page —
    // otherwise the user is bounced to /auth/email → GuestAuthOnly → lock and never
    // sees the key (or a blocking enroll error).
    if (
      !shouldRedirectAwayFromRegistrationForm({
        step,
        registrationAuthStateId,
        email,
      })
    ) {
      return;
    }
    navigate(AUTH_EMAIL_PATH, { replace: true });
  }, [registrationAuthStateId, email, navigate, step]);

  const { isFormValid, allFieldsFilled, passwordLongEnough, passwordsMatch } = useMemo(() => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    const allFieldsFilled =
      trimmedFirst.length > 0 &&
      trimmedLast.length > 0 &&
      masterPassword.length > 0 &&
      repeatMasterPassword.length > 0;

    const passwordLongEnough = masterPassword.length >= MIN_MASTER_PASSWORD_LENGTH;

    const passwordsMatch = repeatMasterPassword.length > 0 && masterPassword === repeatMasterPassword;

    const isFormValid = allFieldsFilled && passwordLongEnough && passwordsMatch;

    return { isFormValid, allFieldsFilled, passwordLongEnough, passwordsMatch };
  }, [firstName, lastName, masterPassword, repeatMasterPassword]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!registrationAuthStateId || !isFormValid) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const pwd = new TextEncoder().encode(masterPassword);
    try {
      await initCrypto();
      const material = await buildRegistrationCryptoArtifacts(pwd);
      const wire = registrationArtifactsToWire(material);

      saveVaultBundle({
        server_key_share_b64: wire.server_key_share,
        device_share_b64: bytesToBase64(material.deviceShare),
        password_kdf_salt_b64: wire.password_kdf_salt,
        password_kdf_params_version: wire.password_kdf_params_version,
        encrypted_private_key: wire.encrypted_private_key,
      });

      const deviceKp = ed25519Keypair();
      const devicePublicKeyB64 = bytesToBase64(deviceKp.slice(32, 64));
      wipeBytes(deviceKp);
      try {
        window.localStorage.setItem(DEVICE_PUBLIC_KEY_KEY, devicePublicKeyB64);
      } catch {
        /* ignore */
      }

      const personalWorkspaceName = t("auth.registration.personalWorkspaceName");
      const personalVaultName = t("web.workspaceSettings.vaults.personal.title");
      const browserEnv = parseBrowserEnvironment(navigator.userAgent ?? "");

      const body: RegisterCompleteRequestDto = {
        auth_state_id: registrationAuthStateId,
        user_public_key: wire.user_public_key,
        user_public_pq_key: wire.user_public_pq_key,
        encrypted_private_key: wire.encrypted_private_key,
        server_key_share: wire.server_key_share,
        password_kdf_salt: wire.password_kdf_salt,
        password_kdf_params_version: wire.password_kdf_params_version,
        device_public_key: devicePublicKeyB64,
        device_share: bytesToBase64(material.deviceShare),
        device_fingerprint: getOrCreateDeviceFingerprint(),
        device_name: browserEnv.deviceName,
        personal_workspace_name: personalWorkspaceName,
        personal_vault_name: personalVaultName,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        platform: browserEnv.platform,
        os_name: browserEnv.osName,
        os_version: browserEnv.osVersion,
        app_version: "web",
        client_type: browserEnv.clientType,
        user_agent: browserEnv.userAgent,
        metadata: { crypto_capable: true },
      };

      const reg = await authClient.completeRegistration(body);
      if (!reg.access_token?.trim()) {
        throw new Error("registration bootstrap token missing");
      }
      // Bootstrap token is scoped to recovery enroll/ack only — do not persist as a
      // full Bearer session. Full session requires the normal email login flow.
      // Keep registrationAuthStateId until finishRegistration so AuthSessionGate /
      // guestEntryPaths still allow /account/new during enroll + recovery export.
      setStep("enrolling");
      setPostRegAccessToken(reg.access_token);
      finalizePendingVaultBundle(reg.user_id);
      clearEmailLoginFlow();

      updateLocalProfile({
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      writeLastLoginMethodHint({ email, primary: "email" });
      // After recovery export, sign in again for a full session (invite handoff survives in storage).
      setPostRegRedirect(
        email.trim()
          ? `${AUTH_EMAIL_PATH}?email=${encodeURIComponent(email.trim())}`
          : AUTH_EMAIL_PATH,
      );

      // Keep vault key until enroll succeeds (no navigate/handoff).
      vaultKeyPendingEnrollRef.current = material.vaultKey;
      wipeBytes(pwd);
      wipeBytes(material.serverKeyShare);
      wipeBytes(material.deviceShare);

      try {
        const secret = await enrollAccountRecoveryKey(material.vaultKey, reg.access_token);
        wipeBytes(material.vaultKey);
        vaultKeyPendingEnrollRef.current = null;
        setRecoverySecret(secret);
        setStep(registrationStepAfterRecoveryEnroll(true));
      } catch (enrollErr) {
        if (import.meta.env.DEV) {
          console.error("[auth/register/recovery-enroll]", enrollErr);
        }
        setFormError(t("auth.registration.recovery.errorEnroll"));
        setStep(registrationStepAfterRecoveryEnroll(false));
      }
    } catch (err) {
      wipeBytes(pwd);
      if (import.meta.env.DEV) {
        console.error("[auth/register/complete]", err);
      }
      try {
        setFormError(t(registrationErrorI18nKey(err)));
      } catch {
        setFormError(t("auth.registration.errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function enrollAccountRecoveryKey(vaultKey: Uint8Array, token: string): Promise<string> {
    const secret = await generateRecoverySecret();
    const secretBytes = new TextEncoder().encode(secret);
    const encryptedBlob = await wrapVaultKeyWithRecoverySecret(vaultKey, secretBytes);
    const core = createAuthenticatedCoreClient(token);
    await core.enrollAccountRecoveryKey({ encryptedBlob });
    return secret;
  }

  async function retryRecoveryEnroll() {
    const vaultKey = vaultKeyPendingEnrollRef.current;
    const token = postRegAccessToken ?? accessToken;
    if (!vaultKey || !token) {
      setFormError(t("auth.registration.recovery.errorEnroll"));
      setStep("enrollFailed");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setStep("enrolling");
    try {
      const secret = await enrollAccountRecoveryKey(vaultKey, token);
      wipeBytes(vaultKey);
      vaultKeyPendingEnrollRef.current = null;
      setRecoverySecret(secret);
      setStep(registrationStepAfterRecoveryEnroll(true));
    } catch (enrollErr) {
      if (import.meta.env.DEV) {
        console.error("[auth/register/recovery-enroll-retry]", enrollErr);
      }
      setFormError(t("auth.registration.recovery.errorEnroll"));
      setStep(registrationStepAfterRecoveryEnroll(false));
    } finally {
      setSubmitting(false);
    }
  }

  async function ackRecoveryKeyExport(): Promise<void> {
    if (recoveryAckedRef.current || recoveryExported) {
      return;
    }
    if (recoveryAckInFlightRef.current) {
      return recoveryAckInFlightRef.current;
    }
    const token = postRegAccessToken ?? accessToken;
    if (!token) {
      throw new Error("missing access token for recovery key export ack");
    }
    const run = (async () => {
      const core = createAuthenticatedCoreClient(token);
      await core.ackAccountRecoveryKeyExport();
      recoveryAckedRef.current = true;
    })();
    recoveryAckInFlightRef.current = run;
    try {
      await run;
    } finally {
      recoveryAckInFlightRef.current = null;
    }
  }

  async function handleRecoveryCopy() {
    if (!recoverySecret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(recoverySecret);
      await ackRecoveryKeyExport();
      setRecoveryExported(true);
      setRecoveryCopied(true);
      if (recoveryCopyResetTimeoutRef.current) {
        clearTimeout(recoveryCopyResetTimeoutRef.current);
      }
      recoveryCopyResetTimeoutRef.current = setTimeout(() => {
        setRecoveryCopied(false);
        recoveryCopyResetTimeoutRef.current = null;
      }, RECOVERY_COPY_SUCCESS_MS);
      toast.success(t("web.keyForm.copied"));
    } catch {
      setFormError(t("web.settingsPopup.recovery.error.copyFailed"));
    }
  }

  async function handleRecoveryDownload() {
    if (!recoverySecret) {
      return;
    }
    const toastId = toast.loading(t("web.settingsPopup.recovery.key.creatingPdf"));
    try {
      await downloadRecoveryKeyPdf(recoverySecret, {
        title: t("auth.registration.recovery.pdfTitle"),
        description: t("auth.registration.recovery.pdfDescription"),
      });
      await ackRecoveryKeyExport();
      setRecoveryExported(true);
    } catch {
      setFormError(t("web.settingsPopup.recovery.error.generic"));
    } finally {
      toast.dismiss(toastId);
    }
  }

  function finishRegistration() {
    void (async () => {
      // Bootstrap token cannot issue extension auth codes; require full login first.
      if (await completeExtensionAuthHandoffIfPending()) {
        return;
      }
      setPostRegAccessToken(null);
      setRegistrationAuthStateId(null);
      const target = postRegRedirect ?? AUTH_EMAIL_PATH;
      setRecoverySecret(null);
      navigate(target, { replace: true });
    })();
  }

  if (step === "enrolling") {
    return (
      <AppShellLayout title={t("auth.registration.recovery.title")} busy>
        <Spinner aria-label={t("auth.registration.recovery.preparing")} />
      </AppShellLayout>
    );
  }

  if (step === "enrollFailed") {
    return (
      <AppShellLayout
        title={t("auth.registration.recovery.title")}
        description={t("auth.registration.recovery.errorEnroll")}
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      >
        <div className="flex w-full flex-col gap-6 rounded-xl border border-border bg-background p-4 shadow-sm">
          {formError ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={submitting}
            onClick={() => void retryRecoveryEnroll()}
          >
            {t("auth.registration.recovery.retryEnroll")}
          </Button>
        </div>
      </AppShellLayout>
    );
  }

  if (step === "recoveryKey" && recoverySecret) {
    return (
      <AppShellLayout
        title={t("auth.registration.recovery.title")}
        description={t("auth.registration.recovery.description")}
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      >
        <div className="flex w-full flex-col gap-6 rounded-xl border border-border bg-background p-4 shadow-sm">
          {formError ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="rounded-lg bg-secondary p-3">
            <p
              className="truncate font-mono text-sm leading-5 text-foreground"
              title={recoverySecret}
            >
              {recoverySecret}
            </p>
          </div>
          <ControlGroup aria-label={t("web.settingsPopup.recovery.key.actionsAria")}>
            <Button
              type="button"
              variant="outline"
              className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
              onClick={() => void handleRecoveryCopy()}
            >
              {recoveryCopied ? (
                <Check className="size-4 shrink-0" aria-hidden />
              ) : (
                <Copy className="size-4 shrink-0" aria-hidden />
              )}
              {recoveryCopied ? t("web.keyForm.copied") : t("auth.registration.recovery.copy")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
              onClick={() => void handleRecoveryDownload()}
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
          <Button type="button" className="w-full" onClick={finishRegistration} disabled={!recoveryExported}>
            {t("auth.registration.recovery.next")}
          </Button>
        </div>
      </AppShellLayout>
    );
  }

  return (
    <AppShellLayout
      title={t("auth.registration.title")}
      description={
        <>
          {t("auth.registration.descriptionBeforeEmail")}{" "}
          <span className="font-semibold">{email}</span>
        </>
      }
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        {formError ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-reg-first-name" className="okkey-small font-medium text-copy-primary">
            {t("auth.registration.firstName")}
          </label>
          <Input
            id="auth-reg-first-name"
            name="givenName"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-reg-last-name" className="okkey-small font-medium text-copy-primary">
            {t("auth.registration.lastName")}
          </label>
          <Input
            id="auth-reg-last-name"
            name="familyName"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-reg-master-password" className="okkey-small font-medium text-copy-primary">
            {t("auth.registration.masterPassword")}
          </label>
          <Input
            id="auth-reg-master-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
          />
          <p className="okkey-small text-copy-secondary">{t("auth.registration.masterPasswordHint")}</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-reg-repeat-master-password" className="okkey-small font-medium text-copy-primary">
            {t("auth.registration.repeatMasterPassword")}
          </label>
          <Input
            id="auth-reg-repeat-master-password"
            name="new-password-confirm"
            type="password"
            autoComplete="new-password"
            value={repeatMasterPassword}
            onChange={(e) => setRepeatMasterPassword(e.target.value)}
          />
        </div>
        <Alert variant="info">
          <AlertTitle className="text-foreground">{t("auth.registration.requirementsTitle")}</AlertTitle>
          <AlertDescription>
            <ul className="mt-3 space-y-1">
              <li className="flex gap-2.5">
                <span className="mt-0.5 shrink-0">
                  {allFieldsFilled ? (
                    <RequirementCheckIcon className="size-4 text-primary" />
                  ) : (
                    <RequirementCrossIcon className="size-4 text-destructive" />
                  )}
                </span>
                <span className={allFieldsFilled ? "text-foreground" : "text-muted-foreground"}>
                  {t("auth.registration.reqAllFields")}
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 shrink-0">
                  {passwordLongEnough ? (
                    <RequirementCheckIcon className="size-4 text-primary" />
                  ) : (
                    <RequirementCrossIcon className="size-4 text-destructive" />
                  )}
                </span>
                <span className={passwordLongEnough ? "text-foreground" : "text-muted-foreground"}>
                  {t("auth.registration.reqPasswordLength", { min: MIN_MASTER_PASSWORD_LENGTH })}
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 shrink-0">
                  {passwordsMatch ? (
                    <RequirementCheckIcon className="size-4 text-primary" />
                  ) : (
                    <RequirementCrossIcon className="size-4 text-destructive" />
                  )}
                </span>
                <span className={passwordsMatch ? "text-foreground" : "text-muted-foreground"}>
                  {t("auth.registration.reqPasswordsMatch")}
                </span>
              </li>
            </ul>
          </AlertDescription>
        </Alert>
        <Button type="submit" variant="default" className="w-full" disabled={!isFormValid || submitting}>
          {t("auth.registration.submit")}
        </Button>
        <p className="text-center">
          <button
            type="button"
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
            onClick={() => {
              logout();
              navigate(AUTH_EMAIL_PATH, { replace: true });
            }}
          >
            {t("auth.registration.differentEmail")}
          </button>
        </p>
      </form>
    </AppShellLayout>
  );
}
