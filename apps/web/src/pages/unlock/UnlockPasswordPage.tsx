import { useMemo, useState, type FormEvent, type SVGProps } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";

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

function buildDisplayName(
  givenName: string,
  familyName: string,
  nameParam: string | null,
  fallback: string,
): string {
  const g = givenName.trim();
  const f = familyName.trim();
  if (g && f) return `${g} ${f}`;
  if (nameParam?.trim()) return nameParam.trim();
  return fallback;
}

function buildInitials(displayName: string, email: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return "??";
}

export default function UnlockPasswordPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "alexzorin@okkey.app";
  const givenName = searchParams.get("givenName") ?? searchParams.get("firstName") ?? "";
  const familyName = searchParams.get("familyName") ?? searchParams.get("lastName") ?? "";
  const nameParam = searchParams.get("name");

  const displayName = useMemo(
    () => buildDisplayName(givenName, familyName, nameParam, "Alexander Zorin"),
    [givenName, familyName, nameParam],
  );

  const initials = useMemo(() => buildInitials(displayName, email), [displayName, email]);

  const [masterPassword, setMasterPassword] = useState("");
  const [showUnlockError, setShowUnlockError] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowUnlockError(true);
  }

  return (
    <AppShellLayout
      title="Vault is locked"
      description="Enter your master password to unlock"
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
              Sign out
            </Link>
          </Button>
        </div>

        <div className="flex w-full flex-col gap-3">
          <label htmlFor="unlock-master-password" className="okkey-small font-medium text-copy-primary">
            Master password
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
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Incorrect master password</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" variant="default" className="w-full" disabled={masterPassword.length === 0}>
          Unlock
        </Button>

        <p className="text-center">
          <button
            type="button"
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            Forgot master password?
          </button>
        </p>
      </form>
    </AppShellLayout>
  );
}
