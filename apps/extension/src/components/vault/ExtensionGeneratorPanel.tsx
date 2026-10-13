import { Popup } from "@okkey/ui";
import { GeneratorSection } from "@okkey/vault-ui";
import { toast } from "sonner";

type ExtensionGeneratorPanelProps = {
  onBack: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
};

export function ExtensionGeneratorPanel({ onBack, t }: ExtensionGeneratorPanelProps) {
  return (
    <Popup
      layout="desktop"
      width={560}
      header={t("web.tools.sections.generator")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onBack}
      panelClassName="min-h-0"
      contentClassName="pt-0"
    >
      <GeneratorSection
        t={t}
        hideIntro
        className="gap-6"
        onCopied={() => {
          toast.success(t("web.keyForm.copied"));
        }}
      />
    </Popup>
  );
}
