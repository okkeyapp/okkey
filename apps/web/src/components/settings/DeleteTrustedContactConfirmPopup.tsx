import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";

type DeleteTrustedContactConfirmPopupProps = {
  open: boolean;
  contactEmail: string;
  deleting?: boolean;
  /** Override copy for leave-as-contact flow. */
  titleKey?: string;
  descriptionKey?: string;
  deleteLabelKey?: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeleteTrustedContactConfirmPopup({
  open,
  contactEmail,
  deleting = false,
  titleKey = "web.settingsPopup.recovery.contacts.deleteConfirm.title",
  descriptionKey = "web.settingsPopup.recovery.contacts.deleteConfirm.description",
  deleteLabelKey = "web.settingsPopup.recovery.contacts.deleteConfirm.delete",
  t,
  onClose,
  onConfirm,
}: DeleteTrustedContactConfirmPopupProps) {
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
      className="z-popup-nested"
      width={420}
      header={t(titleKey)}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={deleting}
      panelClassName="min-h-0"
      contentClassName="pb-0 pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={deleting}>
            {t("web.settingsPopup.recovery.contacts.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>
            {t(deleteLabelKey)}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">
        {t(descriptionKey, { email: contactEmail })}
      </p>
    </Popup>
  );
}
