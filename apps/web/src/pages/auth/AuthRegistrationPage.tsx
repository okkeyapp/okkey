import { useEffect, useMemo, useState, type FormEvent, type SVGProps } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildRegistrationCryptoArtifacts,
  ed25519Keypair,
  initCrypto,
  registrationArtifactsToWire,
  wipeBytes,
} from "@okkey/crypto";
import type { RegisterCompleteRequestDto } from "@okkey/types";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { finalizePendingVaultBundle } from "../../auth/localVaultBundle";
import { bytesToBase64 } from "../../auth/base64";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { useLocale } from "../../locale/LocaleContext";
import { registrationErrorI18nKey } from "./registrationErrors";

const MIN_MASTER_PASSWORD_LENGTH = 4;

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
    applyAccessTokenResponse,
    clearEmailLoginFlow,
    logout,
  } = useAuthVault();

  const email = profile?.email ?? "";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [repeatMasterPassword, setRepeatMasterPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!registrationAuthStateId || !email) {
      navigate("/auth/email", { replace: true });
    }
  }, [registrationAuthStateId, email, navigate]);

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

      const personalWorkspaceName = t("auth.registration.personalWorkspaceName");

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
        device_name: `Web · ${navigator.userAgent?.slice(0, 80) ?? "browser"}`,
        personal_workspace_name: personalWorkspaceName,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        client_type: "web",
        metadata: { crypto_capable: true },
      };

      const reg = await authClient.completeRegistration(body);
      applyAccessTokenResponse({
        access_token: reg.access_token,
        expires_at: reg.expires_at,
        user_id: reg.user_id,
        token_type: reg.token_type,
      });
      finalizePendingVaultBundle(reg.user_id);
      setRegistrationAuthStateId(null);
      clearEmailLoginFlow();

      updateLocalProfile({
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      wipeBytes(material.vaultKey);
      wipeBytes(pwd);
      wipeBytes(material.serverKeyShare);
      wipeBytes(material.deviceShare);

      navigate("/unlock/password", { replace: true });
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
        <Alert variant="default">
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
              navigate("/auth/email", { replace: true });
            }}
          >
            {t("auth.registration.differentEmail")}
          </button>
        </p>
      </form>
    </AppShellLayout>
  );
}
