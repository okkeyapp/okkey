import { Button, Popup } from "@okkey/ui";

type DeleteVaultConfirmPopupProps = {
  open: boolean;
  t: (key: string) => string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  deleting?: boolean;
};

export default function DeleteVaultConfirmPopup({
  open,
  t,
  onCancel,
  onConfirm,
  deleting = false,
}: DeleteVaultConfirmPopupProps) {
  if (!open) {
    return null;
  }

  return (
    <Popup
      id="delete-vault-confirm"
      className="z-[70]"
      width={420}
      header={t("web.workspaceSettings.vaults.deleteConfirm.title")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onCancel}
      closeDisabled={deleting}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={deleting}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={deleting}
          >
            {t("web.workspaceSettings.vaults.deleteConfirm.delete")}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.vaults.deleteConfirm.description")}</p>
    </Popup>
  );
}
