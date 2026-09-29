import { useNavigate } from "react-router-dom";
import { AccountUserBar as AccountUserBarView } from "@okkey/ui";

import { useAuthVault } from "../../auth/AuthVaultContext";
import { AUTH_EMAIL_PATH } from "../../routes/paths";
import { useLocale } from "../../locale/LocaleContext";

export default function AccountUserBar() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { profile, logout } = useAuthVault();

  function handleSignOut() {
    logout();
    navigate(AUTH_EMAIL_PATH, { replace: true });
  }

  return (
    <AccountUserBarView
      email={profile?.email ?? ""}
      firstName={profile?.firstName ?? ""}
      lastName={profile?.lastName ?? ""}
      signOutLabel={t("unlock.signOut")}
      onSignOut={handleSignOut}
    />
  );
}
