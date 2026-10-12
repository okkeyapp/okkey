import { toast } from "sonner";

import { useLocale } from "../../../../locale/LocaleContext";
import { GeneratorSection as SharedGeneratorSection } from "@okkey/vault-ui";

export type { GeneratorMode } from "@okkey/vault-ui";

export default function GeneratorSection() {
  const { t } = useLocale();
  return (
    <SharedGeneratorSection
      t={t}
      onCopied={() => {
        toast.success(t("web.keyForm.copied"));
      }}
    />
  );
}
