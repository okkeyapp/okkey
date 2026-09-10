import { useEffect, useMemo, useState, type FormEvent, type SVGProps } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { initCrypto, unwrapUnlockMaterialWithPin, wipeBytes } from "@okkey/crypto";
import { Alert, AlertDescription, AlertTitle, Button, Input, Spinner } from "@okkey/ui";

import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { ACCOUNT_RESTORE_PATH, AUTH_EMAIL_PATH, DEFAULT_AUTHENTICATED_PATH } from "../../routes/paths";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { tryUnlockWithBiometrics } from "../../auth/biometricUnlock";
import { clearPinFailures, isPinLocked, recordPinFailure } from "../../auth/pinRateLimit";
import { safeRedirectPath } from "../../auth/safeRedirect";
import { readVaultDevicePrefs } from "../../auth/vaultDevicePrefs";
import { readPinUnlockWrap } from "../../auth/vaultDeviceUnlockStore";
import { useLocale } from "../../locale/LocaleContext";

function AlertErrorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

type UnlockMode = "biometric" | "pin" | "master";

export default function UnlockPasswordPage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const {
    accessToken,
    userId,
    tryUnlockWithMasterPassword,
    applyUnlockedSecrets,
    hasVaultBundle,
    vaultUnlockBootstrapLoading,
    vaultUnlocked,
    touchActivity,
  } = useAuthVault();

  const prefs = readVaultDevicePrefs(userId);
  const [mode, setMode] = useState<UnlockMode>(() => {
    if (prefs.biometricEnabled) {
      return "biometric";
    }
    if (prefs.pinEnabled) {
      return "pin";
    }
    return "master";
  });
  const [bioBusy, setBioBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [showUnlockError, setShowUnlockError] = useState(false);
  const [noBundleError, setNoBundleError] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const restoreHref = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${ACCOUNT_RESTORE_PATH}?${q}` : ACCOUNT_RESTORE_PATH;
  }, [searchParams]);

  useEffect(() => {
    if (mode !== "biometric" || !userId || vaultUnlocked) {
      return;
    }
    let cancelled = false;
    setBioBusy(true);
    void (async () => {
      await initCrypto();
      const unlocked = await tryUnlockWithBiometrics(userId);
      if (cancelled) {
        return;
      }
      setBioBusy(false);
      if (unlocked) {
        applyUnlockedSecrets(unlocked.vaultKey, unlocked.passwordShareC);
        touchActivity();
        return;
      }
      setMode(prefs.pinEnabled ? "pin" : "master");
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, userId, vaultUnlocked, applyUnlockedSecrets, touchActivity, prefs.pinEnabled]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowUnlockError(false);
    setNoBundleError(false);
    setPinError(null);
    if (vaultUnlockBootstrapLoading || bioBusy) {
      return;
    }
    if (!hasVaultBundle) {
      setNoBundleError(true);
      return;
    }
    await initCrypto();

    if (mode === "pin") {
      if (!userId) {
        return;
      }
      if (isPinLocked(userId)) {
        setPinError(t("unlock.pinLocked"));
        return;
      }
      const wrap = readPinUnlockWrap(userId);
      if (!wrap) {
        setMode("master");
        return;
      }
      const pinBytes = new TextEncoder().encode(secret);
      try {
        const unlocked = await unwrapUnlockMaterialWithPin({ wrap, pinUtf8: pinBytes });
        clearPinFailures(userId);
        applyUnlockedSecrets(unlocked.vaultKey, unlocked.passwordShareC);
        touchActivity();
      } catch {
        const result = recordPinFailure(userId);
        setPinError(result.locked ? t("unlock.pinLocked") : t("unlock.pinIncorrect"));
      } finally {
        wipeBytes(pinBytes);
      }
      return;
    }

    const ok = await tryUnlockWithMasterPassword(secret);
    if (!ok) {
      setShowUnlockError(true);
      return;
    }
    touchActivity();
  }

  if (vaultUnlocked) {
    const redirect = safeRedirectPath(searchParams.get("redirect"), DEFAULT_AUTHENTICATED_PATH);
    return <Navigate to={redirect} replace />;
  }

  if (!accessToken) {
    return <Navigate to={AUTH_EMAIL_PATH} replace />;
  }

  const fieldsDisabled = bioBusy || vaultUnlockBootstrapLoading || (mode === "pin" && userId !== null && isPinLocked(userId));

  return (
    <AppShellLayout
      title={t("unlock.title")}
      description={t("unlock.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        <AccountUserBar />

        {vaultUnlockBootstrapLoading ? (
          <div className="flex flex-col items-center gap-3 py-1" role="status" aria-busy="true">
            <Spinner />
            <p className="okkey-small text-center text-copy-secondary">{t("unlock.syncingVault")}</p>
          </div>
        ) : null}

        {bioBusy ? (
          <p className="okkey-small text-center text-copy-secondary">{t("unlock.biometricPending")}</p>
        ) : null}

        {mode === "pin" ? (
          <div className="flex w-full flex-col gap-3">
            <label htmlFor="unlock-pin" className="okkey-small font-medium text-copy-primary">
              {t("unlock.pin")}
            </label>
            <Input
              id="unlock-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={secret}
              disabled={fieldsDisabled}
              onChange={(e) => {
                setSecret(e.target.value.replace(/\D/g, "").slice(0, 8));
                setPinError(null);
                setNoBundleError(false);
              }}
            />
          </div>
        ) : null}

        {mode === "master" ? (
          <div className="flex w-full flex-col gap-3">
            <label htmlFor="unlock-master-password" className="okkey-small font-medium text-copy-primary">
              {t("unlock.masterPassword")}
            </label>
            <Input
              id="unlock-master-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={secret}
              disabled={fieldsDisabled}
              onChange={(e) => {
                setSecret(e.target.value);
                setShowUnlockError(false);
                setNoBundleError(false);
              }}
            />
          </div>
        ) : null}

        {noBundleError ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{t("unlock.errorNoLocalVault")}</AlertDescription>
          </Alert>
        ) : null}

        {showUnlockError ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{t("unlock.errorIncorrectPassword")}</AlertDescription>
          </Alert>
        ) : null}

        {pinError ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{pinError}</AlertDescription>
          </Alert>
        ) : null}

        {mode === "master" || mode === "pin" ? (
          <Button
            type="submit"
            variant="default"
            className="w-full"
            disabled={secret.length === 0 || fieldsDisabled}
          >
            {t("unlock.submit")}
          </Button>
        ) : null}

        {mode !== "master" ? (
          <p className="text-center">
            <button
              type="button"
              className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
              disabled={bioBusy}
              onClick={() => {
                setSecret("");
                setShowUnlockError(false);
                setPinError(null);
                setMode("master");
              }}
            >
              {t("unlock.useMasterPassword")}
            </button>
          </p>
        ) : null}

        {mode === "master" && prefs.pinEnabled ? (
          <p className="text-center">
            <button
              type="button"
              className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
              onClick={() => {
                setSecret("");
                setShowUnlockError(false);
                setPinError(null);
                setMode("pin");
              }}
            >
              {t("unlock.usePin")}
            </button>
          </p>
        ) : null}

        <p className="text-center">
          <Link
            to={restoreHref}
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("unlock.forgotPassword")}
          </Link>
        </p>
      </form>
    </AppShellLayout>
  );
}
