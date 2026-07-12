import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";

type ExitNewItemFormConfirmPopupProps = {
  open: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function ExitNewItemFormConfirmPopup({
  open,
  t,
  onClose,
  onConfirm,
}: ExitNewItemFormConfirmPopupProps) {
  if (!open) {
    return null;
  }

  return (
    <Popup
      className="z-[70]"
      width={420}
      header={t("web.exitNewItemFormConfirmPopup.title")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onClose}
      panelClassName="min-h-0"
      contentClassName="pb-0 pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {t("web.exitNewItemFormConfirmPopup.continue")}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">{t("web.exitNewItemFormConfirmPopup.description")}</p>
    </Popup>
  );
}
