import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";

type CopyGuardConfirmPopupProps = {
  open: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onCancel: () => void;
  onCopy: () => void;
};

export function CopyGuardConfirmPopup({ open, t, onCancel, onCopy }: CopyGuardConfirmPopupProps) {
  if (!open) {
    return null;
  }

  return (
    <Popup
      className="z-popup-nested"
      width={420}
      header={t("extension.vault.copyGuardTitle")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onCancel}
      panelClassName="min-h-0"
      contentClassName="pb-0 pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("extension.vault.copyGuardCancel")}
          </Button>
          <Button type="button" onClick={onCopy}>
            {t("extension.vault.copyGuardConfirm")}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">{t("extension.vault.copyGuardBody")}</p>
    </Popup>
  );
}
