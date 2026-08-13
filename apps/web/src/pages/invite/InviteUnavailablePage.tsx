import { Alert, AlertDescription, AlertTitle } from "@okkey/ui";

import AppShellLayout from "@/components/app-shell/AppShellLayout";
import OkkeyLogoMark from "@/components/app-shell/OkkeyLogoMark";
import { useLocale } from "@/locale/LocaleContext";

export default function InviteUnavailablePage() {
  const { t } = useLocale();
  return (
    <AppShellLayout
      title={t("web.invite.unavailableTitle")}
      description={t("web.invite.unavailable")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <Alert>
        <AlertTitle>{t("web.invite.unavailableTitle")}</AlertTitle>
        <AlertDescription>{t("web.invite.unavailable")}</AlertDescription>
      </Alert>
    </AppShellLayout>
  );
}
