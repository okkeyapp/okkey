import { useMemo, useState, type FormEvent, type SVGProps } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";

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
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "alexzorin@okkey.app";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [repeatMasterPassword, setRepeatMasterPassword] = useState("");

  const { isFormValid, allFieldsFilled, passwordLongEnough, passwordsMatch } = useMemo(() => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    const allFieldsFilled =
      trimmedFirst.length > 0 &&
      trimmedLast.length > 0 &&
      masterPassword.length > 0 &&
      repeatMasterPassword.length > 0;

    const passwordLongEnough = masterPassword.length >= MIN_MASTER_PASSWORD_LENGTH;

    const passwordsMatch =
      repeatMasterPassword.length > 0 && masterPassword === repeatMasterPassword;

    const isFormValid = allFieldsFilled && passwordLongEnough && passwordsMatch;

    return { isFormValid, allFieldsFilled, passwordLongEnough, passwordsMatch };
  }, [firstName, lastName, masterPassword, repeatMasterPassword]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <AppShellLayout
      title="Register with Okkey"
      description={
        <>
          You signed in with <span className="font-semibold">{email}</span>
        </>
      }
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-reg-first-name" className="okkey-small font-medium text-copy-primary">
            First name
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
            Last name
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
            Master password
          </label>
          <Input
            id="auth-reg-master-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
          />
          <p className="okkey-small text-copy-secondary">
            This is the only password you need to remember. You will use it to unlock your vault. If you lose your
            master password, it cannot be recovered.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-reg-repeat-master-password" className="okkey-small font-medium text-copy-primary">
            Repeat master password
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
          <AlertTitle className="text-foreground">Before you register</AlertTitle>
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
                <span className={allFieldsFilled ? "text-foreground" : "text-muted-foreground"}>All fields are filled</span>
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
                  Password is at least {MIN_MASTER_PASSWORD_LENGTH} characters
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
                <span className={passwordsMatch ? "text-foreground" : "text-muted-foreground"}>Passwords match</span>
              </li>
            </ul>
          </AlertDescription>
        </Alert>
        <Button type="submit" variant="default" className="w-full" disabled={!isFormValid}>
          Register
        </Button>
        <p className="text-center">
          <Link
            to="/auth/email"
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            Log in with a different email
          </Link>
        </p>
      </form>
    </AppShellLayout>
  );
}
