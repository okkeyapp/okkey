import { Alert, AlertDescription } from "@okkey/ui";

import { useLocale } from "../../locale/LocaleContext";
import { shouldShowMailNotConfiguredHint } from "./mailNotConfiguredHint";

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
        {t("auth.otp.mailNotConfiguredHint")}{" "}
        <code className="font-mono text-xs">{t("auth.otp.mailNotConfiguredCommand")}</code>
      </AlertDescription>
    </Alert>
  );
}
