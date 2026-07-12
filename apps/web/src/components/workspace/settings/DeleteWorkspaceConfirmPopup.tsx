import type { WebMessageValues } from "@okkey/i18n";
import { Button, Input, Popup } from "@okkey/ui";
import { useEffect, useState } from "react";

type DeleteWorkspaceConfirmPopupProps = {
  open: boolean;
  workspaceName: string;
  deleting?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeleteWorkspaceConfirmPopup({
  open,
  workspaceName,
  deleting = false,
  t,
  onClose,
  onConfirm,
}: DeleteWorkspaceConfirmPopupProps) {
  const [confirmationName, setConfirmationName] = useState("");

  useEffect(() => {
    if (!open) {
      setConfirmationName("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const canDelete = confirmationName.trim() === workspaceName.trim();

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
      header={t("web.workspaceSettings.deleteConfirm.title")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={deleting}
      panelClassName="min-h-0"
      contentClassName="pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={deleting}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={!canDelete || deleting}>
            {t("web.workspaceSettings.general.deleteAction")}
          </Button>
        </>
      }
    >
      <div className="flex w-full flex-col gap-4">
        <p className="text-sm leading-5 text-muted-foreground">
          {t("web.workspaceSettings.deleteConfirm.descriptionPrefix")}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline decoration-dotted underline-offset-2"
            onClick={() => void navigator.clipboard.writeText(workspaceName)}
          >
            {workspaceName}
          </button>
          {t("web.workspaceSettings.deleteConfirm.descriptionSuffix")}
        </p>
        <div className="flex flex-col gap-2 pb-8">
          <label htmlFor="delete-workspace-confirmation-name" className="text-sm font-medium text-foreground">
            {t("web.workspaceSettings.deleteConfirm.inputLabel")}
          </label>
          <Input
            id="delete-workspace-confirmation-name"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            placeholder={workspaceName}
            autoFocus
            disabled={deleting}
          />
        </div>
      </div>
    </Popup>
  );
}
