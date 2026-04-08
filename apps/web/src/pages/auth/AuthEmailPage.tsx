import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { useLocale } from "../../locale/LocaleContext";
import { emailStartErrorI18nKey } from "./emailStartErrors";

export default function AuthEmailPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { authClient, setEmailChallenge, updateLocalProfile } = useAuthVault();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const start = await authClient.startEmailLogin(trimmed, locale);
      updateLocalProfile({ email: trimmed });
      setEmailChallenge(trimmed, start.challengeId, start.resendAvailableAt);
      navigate("/auth/otp", { replace: true });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[auth/email/start]", err);
      }
      try {
        setError(t(emailStartErrorI18nKey(err)));
      } catch {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShellLayout
      title={t("auth.email.title")}
      description={t("auth.email.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-email" className="okkey-small font-medium text-copy-primary">
            {t("auth.email.labelEmail")}
          </label>
          <Input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t("auth.email.placeholderEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" variant="default" className="w-full" disabled={submitting}>
          {t("auth.email.submit")}
        </Button>
        <p className="text-center text-xs leading-4 text-copy-secondary">
          {t("auth.email.legalBeforeLink")}
          <Link
            to="/privacy"
            className="text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("auth.email.privacyLink")}
          </Link>
          {t("auth.email.legalAfterLink")}
        </p>
      </form>
    </AppShellLayout>
  );
}
