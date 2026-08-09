import { Button, Popup } from "@okkey/ui";

type DeleteMemberConfirmPopupProps = {
  open: boolean;
  pending?: boolean;
  t: (key: string) => string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  deleting?: boolean;
};

export default function DeleteMemberConfirmPopup({
  open,
  pending = false,
  t,
  onCancel,
  onConfirm,
  deleting = false,
}: DeleteMemberConfirmPopupProps) {
  if (!open) {
    return null;
  }

  return (
    <Popup
      id="delete-member-confirm"
      className="z-[70]"
      width={420}
      header={
        pending
          ? t("web.workspaceSettings.members.deleteConfirm.inviteTitle")
          : t("web.workspaceSettings.members.deleteConfirm.title")
      }
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
            {t("web.workspaceSettings.members.deleteConfirm.delete")}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        {pending
          ? t("web.workspaceSettings.members.deleteConfirm.inviteDescription")
          : t("web.workspaceSettings.members.deleteConfirm.description")}
      </p>
    </Popup>
  );
}
