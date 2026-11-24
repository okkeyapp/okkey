import { toast } from "sonner";

import { GeneratorSection as SharedGeneratorSection } from "@okkey/vault-ui";

import { publicDocsUrl } from "../../../../docs/publicDocsUrl";
import { useLocale } from "../../../../locale/LocaleContext";

export type { GeneratorMode } from "@okkey/vault-ui";

export default function GeneratorSection() {
  const { t, locale } = useLocale();
  return (
    <SharedGeneratorSection
      t={t}
      learnMoreHref={publicDocsUrl("generator", locale)}
      onCopied={() => {
        toast.success(t("web.keyForm.copied"));
      }}
    />
  );
}
