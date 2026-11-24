import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@okkey/ui";

import { useLocale } from "../../locale/LocaleContext";
import { AUTH_MASTER_PASSWORD_PATH } from "../../routes/paths";
import { shouldShowMailNotConfiguredHint } from "./shouldShowMailNotConfiguredHint";

export function MailNotConfiguredHint({
  emailDeliverable,
}: {
  emailDeliverable: boolean | null | undefined;
}) {
  const { t } = useLocale();
  if (!shouldShowMailNotConfiguredHint(emailDeliverable)) {
    return null;
  }
  return (
    <Alert variant="info">
      <AlertDescription>
        <p>{t("auth.otp.mailNotConfiguredHint")}</p>
        <p>
          {t("auth.otp.mailNotConfiguredRunPrefix")}{" "}
          <code className="rounded-[4px] bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground">
            {t("auth.otp.mailNotConfiguredCommand")}
          </code>
        </p>
        <p>
          {t("auth.otp.mailNotConfiguredOrMasterPrefix")}
          <Link
            to={AUTH_MASTER_PASSWORD_PATH}
            className="text-primary underline decoration-solid underline-offset-2 hover:no-underline"
          >
            {t("auth.otp.mailNotConfiguredOrMasterLink")}
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
