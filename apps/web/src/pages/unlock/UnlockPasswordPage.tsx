import { useMemo, useState, type FormEvent, type SVGProps } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { initCrypto } from "@okkey/crypto";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { ACCOUNT_RESTORE_PATH } from "../../routes/paths";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { safeRedirectPath } from "../../auth/safeRedirect";
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

export default function UnlockPasswordPage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const {
    accessToken,
    tryUnlockWithMasterPassword,
    hasVaultBundle,
    vaultUnlockBootstrapLoading,
    vaultUnlocked,
    touchActivity,
  } = useAuthVault();

  const restoreHref = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${ACCOUNT_RESTORE_PATH}?${q}` : ACCOUNT_RESTORE_PATH;
  }, [searchParams]);

  const [masterPassword, setMasterPassword] = useState("");
  const [showUnlockError, setShowUnlockError] = useState(false);
  const [noBundleError, setNoBundleError] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowUnlockError(false);
    setNoBundleError(false);
    if (vaultUnlockBootstrapLoading) {
      return;
    }
    if (!hasVaultBundle) {
      setNoBundleError(true);
      return;
    }
    await initCrypto();
    const ok = await tryUnlockWithMasterPassword(masterPassword);
    if (!ok) {
      setShowUnlockError(true);
      return;
    }
    touchActivity();
  }

  if (vaultUnlocked) {
    const redirect = safeRedirectPath(searchParams.get("redirect"), "/workspaces");
    return <Navigate to={redirect} replace />;
  }

  if (!accessToken) {
    return <Navigate to="/auth/email" replace />;
  }

  return (
    <AppShellLayout
      title={t("unlock.title")}
      description={t("unlock.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        <AccountUserBar />

        {vaultUnlockBootstrapLoading ? (
          <p className="okkey-small text-center text-copy-secondary">{t("unlock.syncingVault")}</p>
        ) : null}

        <div className="flex w-full flex-col gap-3">
          <label htmlFor="unlock-master-password" className="okkey-small font-medium text-copy-primary">
            {t("unlock.masterPassword")}
          </label>
          <Input
            id="unlock-master-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={masterPassword}
            onChange={(e) => {
              setMasterPassword(e.target.value);
              setShowUnlockError(false);
              setNoBundleError(false);
            }}
          />
        </div>

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

        <Button
          type="submit"
          variant="default"
          className="w-full"
          disabled={masterPassword.length === 0 || vaultUnlockBootstrapLoading}
        >
          {t("unlock.submit")}
        </Button>

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
