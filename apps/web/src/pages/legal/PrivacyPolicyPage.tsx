import { Button } from "@okkey/ui";
import { Link } from "react-router-dom";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useLocale } from "../../locale/LocaleContext";
import { ROOT_PATH } from "../../routes/paths";
import { selfHostedPrivacyHtmlEn } from "./content/selfHosted.en";
import { selfHostedPrivacyHtmlRu } from "./content/selfHosted.ru";
import PrivacyPolicyHtml from "./PrivacyPolicyHtml";

/**
 * Short self-hosted / OSS privacy policy (no company legal-entity fields).
 * Enterprise builds may replace this page via `@okkey-enterprise/legal`.
 */
export default function PrivacyPolicyPage() {
  const { t, locale } = useLocale();
  const html = locale === "ru" ? selfHostedPrivacyHtmlRu : selfHostedPrivacyHtmlEn;

  return (
    <AppShellLayout
      title={t("legal.privacy.title")}
      description={t("legal.privacy.selfHosted.lead")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      topLeft={
        <Button asChild variant="secondary">
          <Link to={ROOT_PATH} aria-label={t("legal.privacy.backAria")}>
            ← {t("legal.privacy.back")}
          </Link>
        </Button>
      }
      contentClassName="max-w-[640px]"
      frameClassName="px-4 md:px-10"
      headerClassName="gap-3"
      childrenClassName="pt-2"
    >
      <PrivacyPolicyHtml html={html} />
    </AppShellLayout>
  );
}
