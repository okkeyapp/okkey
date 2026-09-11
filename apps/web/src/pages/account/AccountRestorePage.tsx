import { useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@okkey/ui";

import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { ACCOUNT_LOCK_PATH, DEFAULT_AUTHENTICATED_PATH } from "../../routes/paths";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { safeRedirectPath } from "../../auth/safeRedirect";
import { useLocale } from "../../locale/LocaleContext";

export default function AccountRestorePage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const { vaultUnlocked } = useAuthVault();

  const lockHref = useMemo(() => {
    const redirect = searchParams.get("redirect");
    if (redirect) {
      return `${ACCOUNT_LOCK_PATH}?redirect=${encodeURIComponent(redirect)}`;
    }
    return ACCOUNT_LOCK_PATH;
  }, [searchParams]);

  if (vaultUnlocked) {
    const redirect = safeRedirectPath(searchParams.get("redirect"), DEFAULT_AUTHENTICATED_PATH);
    return <Navigate to={redirect} replace />;
  }

  return (
    <AppShellLayout
      title={t("account.restore.title")}
      description={t("account.restore.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <div className="flex w-full flex-col gap-6">
        <AccountUserBar />

        <Alert variant="info">
          <AlertTitle className="text-foreground">{t("account.restore.proOnlyTitle")}</AlertTitle>
          <AlertDescription className="text-copy-secondary">{t("account.restore.proOnlyBody")}</AlertDescription>
        </Alert>

        <p className="text-center">
          <Link
            to={lockHref}
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("account.restore.backToMasterPassword")}
          </Link>
        </p>
      </div>
    </AppShellLayout>
  );
}
