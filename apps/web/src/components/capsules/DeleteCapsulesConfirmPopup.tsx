import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";

type DeleteCapsulesConfirmPopupProps = {
  open: boolean;
  multiple: boolean;
  deleting?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeleteCapsulesConfirmPopup({
  open,
  multiple,
  deleting = false,
  t,
  onClose,
  onConfirm,
}: DeleteCapsulesConfirmPopupProps) {
  if (!open) {
    return null;
  }

  function handleClose() {
    if (deleting) {
      return;
    }
    onClose();
  }

  return (
    <Popup
      className="z-[60]"
      width={420}
      header={t(multiple ? "web.deleteCapsulesConfirmPopup.titleMultiple" : "web.deleteCapsulesConfirmPopup.titleSingle")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={deleting}
      panelClassName="min-h-0"
      contentClassName="pb-0 pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={deleting}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>
            {t("web.deleteCapsulesConfirmPopup.delete")}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">
        {t(
          multiple
            ? "web.deleteCapsulesConfirmPopup.descriptionMultiple"
            : "web.deleteCapsulesConfirmPopup.descriptionSingle",
        )}
      </p>
    </Popup>
  );
}
