import { Button, Popup } from "@okkey/ui";

type SettingsDeleteConfirmPopupProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function SettingsDeleteConfirmPopup({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  deleting = false,
  onClose,
  onConfirm,
}: SettingsDeleteConfirmPopupProps) {
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
      className="z-popup-nested-high"
      width={420}
      header={title}
      closeLabel={closeLabel}
      onClose={handleClose}
      closeDisabled={deleting}
      panelClassName="min-h-0"
      contentClassName="pb-0 pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={deleting}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">{description}</p>
    </Popup>
  );
}
