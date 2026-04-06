import { useState, type FormEvent, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
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

function LogOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

/** Until vault session provides profile, show a fixed card (no query params). */
const UNLOCK_PLACEHOLDER_FIRST_NAME = "Alexander";
const UNLOCK_PLACEHOLDER_LAST_NAME = "Zorin";
const UNLOCK_PLACEHOLDER_EMAIL = "alexzorin@okkey.app";

function firstLetter(value: string): string {
  const t = value.trim();
  if (t.length === 0) return "";
  const ch = [...t][0];
  return ch ?? "";
}

/** First letter of given name + first letter of family name; falls back if a part is missing. */
function buildInitials(firstName: string, lastName: string, email: string): string {
  const f = firstLetter(firstName);
  const l = firstLetter(lastName);
  if (f && l) {
    return `${f.toLocaleUpperCase()}${l.toLocaleUpperCase()}`;
  }

  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = firstLetter(parts[0]);
    const b = firstLetter(parts[parts.length - 1]);
    return `${a.toLocaleUpperCase()}${b.toLocaleUpperCase()}`;
  }
  if (parts.length === 1) {
    const w = parts[0];
    const chars = [...w];
    if (chars.length >= 2) {
      return `${chars[0].toLocaleUpperCase()}${chars[1].toLocaleUpperCase()}`;
    }
  }

  const local = email.split("@")[0] ?? "";
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return "??";
}

export default function UnlockPasswordPage() {
  const { t } = useLocale();
  const firstName = UNLOCK_PLACEHOLDER_FIRST_NAME;
  const lastName = UNLOCK_PLACEHOLDER_LAST_NAME;
  const email = UNLOCK_PLACEHOLDER_EMAIL;
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const initials = buildInitials(firstName, lastName, email);

  const [masterPassword, setMasterPassword] = useState("");
  const [showUnlockError, setShowUnlockError] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowUnlockError(true);
  }

  return (
    <AppShellLayout
      title={t("unlock.title")}
      description={t("unlock.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        <div className="flex w-full items-center gap-2 rounded-lg border border-border p-2">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold uppercase leading-none text-primary-foreground"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate okkey-small font-semibold text-copy-primary">{displayName}</p>
            <p className="truncate text-xs leading-4 text-copy-secondary">{email}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5" asChild>
            <Link to="/auth/email">
              <LogOutIcon className="size-4" />
              {t("unlock.signOut")}
            </Link>
          </Button>
        </div>

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
            }}
          />
        </div>

        {showUnlockError ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{t("unlock.errorIncorrectPassword")}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" variant="default" className="w-full" disabled={masterPassword.length === 0}>
          {t("unlock.submit")}
        </Button>

        <p className="text-center">
          <button
            type="button"
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("unlock.forgotPassword")}
          </button>
        </p>
      </form>
    </AppShellLayout>
  );
}
