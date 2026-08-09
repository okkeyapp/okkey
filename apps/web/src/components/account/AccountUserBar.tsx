import { type SVGProps } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Favicon } from "@okkey/ui";

import { useAuthVault } from "../../auth/AuthVaultContext";
import { AUTH_EMAIL_PATH } from "../../routes/paths";
import { useLocale } from "../../locale/LocaleContext";

function LogOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

export default function AccountUserBar() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { profile, logout } = useAuthVault();

  const firstName = profile?.firstName ?? "";
  const lastName = profile?.lastName ?? "";
  const email = profile?.email ?? "";
  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const hasDisplayName = displayName.length > 0;
  const faviconName = hasDisplayName ? displayName : email || "?";

  function handleSignOut() {
    logout();
    navigate(AUTH_EMAIL_PATH, { replace: true });
  }

  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-border p-2">
      <Favicon name={faviconName} size={40} aria-hidden />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate okkey-small font-semibold text-copy-primary">{hasDisplayName ? displayName : email || "—"}</p>
        {hasDisplayName && email ? <p className="truncate text-xs leading-4 text-copy-secondary">{email}</p> : null}
      </div>
      <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5" onClick={handleSignOut}>
        <LogOutIcon className="size-4" />
        {t("unlock.signOut")}
      </Button>
    </div>
  );
}
