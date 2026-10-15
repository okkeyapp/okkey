import type { Vault } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";
import { useState } from "react";

import { useSectionReauth } from "../../../../auth/SectionReauthContext";
import { runSaveWithToast } from "../../../../lib/saveWithToast";

import DeleteVaultConfirmPopup from "./DeleteVaultConfirmPopup";
import {
  DEFAULT_SHARED_VAULT_ICON,
  normalizeVaultIcon,
} from "./vaultIcons";

type RemnantVaultDeleteClient = {
  deleteVault: (vaultId: string) => Promise<{ deleted: true }>;
};

type RemnantSharedVaultCardPopupProps = {
  popupId: string;
  vault: Vault;
  core: RemnantVaultDeleteClient;
  canDelete: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
};

/**
 * View-only card for a shared vault that remains after ENTERPRISE → FREE
 * (modules off / plan without sharedVaults). Fields are not editable; delete only.
 */
export default function RemnantSharedVaultCardPopup({
  popupId,
  vault,
  core,
  canDelete,
  t,
  onClose,
  onDeleted,
}: RemnantSharedVaultCardPopupProps) {
  const { requestZoneUnlock } = useSectionReauth();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const icon = normalizeVaultIcon(vault.icon, DEFAULT_SHARED_VAULT_ICON);
  const description = vault.description?.trim() ?? "";

  async function handleDelete() {
    if (!canDelete) {
      return;
    }
    if (!(await requestZoneUnlock("deletion", { persist: false }))) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.toast.save.error"),
        },
        async () => {
          await core.deleteVault(vault.id);
          await onDeleted();
        },
      );
      setDeleteConfirmOpen(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("web.toast.save.error"));
    } finally {
      setDeleting(false);
    }
  }

  const header = (
    <div className="flex min-w-0 items-center gap-3">
      <h2 className="truncate text-lg font-semibold leading-7 text-foreground">
        {t("web.workspaceSettings.vaults.card.editTitle")}
      </h2>
      <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-sm font-normal leading-5 text-muted-foreground">
        {t("web.workspaceSettings.vaults.card.sharedSubtitle")}
      </span>
    </div>
  );

  return (
    <>
      <Popup
        id={popupId}
        className="z-popup-nested"
        width={480}
        header={header}
        closeLabel={t("web.settingsPopup.close")}
        onClose={onClose}
        closeDisabled={deleting}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {canDelete ? (
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {t("web.workspaceSettings.vaults.deleteConfirm.delete")}
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={deleting}>
              {t("web.settingsPopup.close")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-xl leading-none">
              <span aria-hidden>{icon}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-sm font-medium leading-5 text-foreground">{vault.name}</p>
              {description.length > 0 ? (
                <p className="text-sm leading-5 text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </Popup>

      <DeleteVaultConfirmPopup
        open={deleteConfirmOpen}
        t={t}
        deleting={deleting}
        onCancel={() => {
          if (!deleting) {
            setDeleteConfirmOpen(false);
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
