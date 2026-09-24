import { Button } from "@okkey/ui";
import { Link } from "react-router-dom";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useLocale } from "../../locale/LocaleContext";
import { ROOT_PATH } from "../../routes/paths";
import PrivacyPolicyBody, { type PrivacyPolicySection } from "./PrivacyPolicyBody";

const SECTION_IDS = [
  "about",
  "operator",
  "data",
  "vault",
  "purposes",
  "retention",
  "rights",
  "contact",
] as const;

/**
 * Short self-hosted / OSS privacy policy (no operator legal-entity fields).
 * Enterprise builds may replace this page via `@okkey-enterprise/legal`.
 */
export default function PrivacyPolicyPage() {
  const { t } = useLocale();

  const sections: PrivacyPolicySection[] = SECTION_IDS.map((id) => ({
    title: t(`legal.privacy.selfHosted.${id}.title`),
    paragraphs: [t(`legal.privacy.selfHosted.${id}.body`)],
  }));

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
      <PrivacyPolicyBody sections={sections} />
    </AppShellLayout>
  );
}
