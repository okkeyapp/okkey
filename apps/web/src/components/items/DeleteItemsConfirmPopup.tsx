import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";

type DeleteItemsConfirmPopupProps = {
  open: boolean;
  multiple: boolean;
  retentionDays: number;
  deleting?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeleteItemsConfirmPopup({
  open,
  multiple,
  retentionDays,
  deleting = false,
  t,
  onClose,
  onConfirm,
}: DeleteItemsConfirmPopupProps) {
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
      header={t(multiple ? "web.deleteItemsConfirmPopup.titleMultiple" : "web.deleteItemsConfirmPopup.titleSingle")}
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
            {t("web.deleteItemsConfirmPopup.delete")}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">
        {t(
          multiple ? "web.deleteItemsConfirmPopup.descriptionMultiple" : "web.deleteItemsConfirmPopup.descriptionSingle",
          { days: retentionDays },
        )}
      </p>
    </Popup>
  );
}
