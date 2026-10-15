import type { CoreApiClient } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import {
  permissionAllowsObject,
  type WorkspaceCustomRoleRemnantDto,
  type WorkspaceResourcePermissionDto,
  type WorkspaceRoleSummary,
} from "@okkey/types";
import { useCallback, useEffect, useState } from "react";

import { useAuthVault } from "../../../../auth/AuthVaultContext";
import { useSectionReauth } from "../../../../auth/SectionReauthContext";
import { runSaveWithToast } from "../../../../lib/saveWithToast";
import SettingsDeleteConfirmPopup from "../SettingsDeleteConfirmPopup";
import SettingsRowDeleteButton from "../SettingsRowDeleteButton";
import RolesListCard from "./RolesListCard";

type RemnantCustomRolesListProps = {
  workspaceId: string;
  core: CoreApiClient;
  t: (messageKey: string, values?: WebMessageValues) => string;
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
  onDeleted?: () => void;
};

/**
 * Custom roles left after enterprise modules were disabled (or the plan was downgraded):
 * still listed and removable, but not editable.
 */
export default function RemnantCustomRolesList({
  workspaceId,
  core,
  t,
  resourcePermissions = null,
  onDeleted,
}: RemnantCustomRolesListProps) {
  const { userId } = useAuthVault();
  const { requestZoneUnlock } = useSectionReauth();
  const [roles, setRoles] = useState<WorkspaceCustomRoleRemnantDto[]>([]);
  const [pendingDelete, setPendingDelete] = useState<WorkspaceCustomRoleRemnantDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await core.listWorkspaceRoles(workspaceId);
      setRoles(
        response.roles.filter((role): role is WorkspaceCustomRoleRemnantDto => role.kind === "custom"),
      );
    } catch {
      setRoles([]);
    }
  }, [core, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteLevel = resourcePermissions?.delete ?? 0;
  const canDelete = (role: WorkspaceCustomRoleRemnantDto) =>
    permissionAllowsObject(deleteLevel, Boolean(userId && role.created_by === userId));

  async function confirmDelete() {
    if (!pendingDelete || deleting || !canDelete(pendingDelete)) {
      return;
    }
    if (!(await requestZoneUnlock("deletion", { persist: false }))) {
      return;
    }
    const roleId = pendingDelete.id;
    setDeleting(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.toast.save.error"),
        },
        () => core.deleteWorkspaceRole(workspaceId, roleId),
      );
      setRoles((current) => current.filter((role) => role.id !== roleId));
      setPendingDelete(null);
      onDeleted?.();
    } catch {
      /* toast */
    } finally {
      setDeleting(false);
    }
  }

  if (roles.length === 0) {
    return null;
  }

  const summaries: WorkspaceRoleSummary[] = roles.map((role) => ({
    id: role.id,
    kind: "custom",
    name: role.name,
    description: role.description,
    memberCount: role.member_count,
  }));
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const deleteLabel = t("web.workspaceSettings.roles.actions.deleteRole");

  return (
    <>
      <RolesListCard
        roles={summaries}
        t={t}
        listWindowResetKey={workspaceId}
        renderTrailing={(summary) => {
          const role = rolesById.get(summary.id);
          if (!role || !canDelete(role)) {
            return null;
          }
          return (
            <SettingsRowDeleteButton
              label={deleteLabel}
              disabled={deleting}
              onClick={() => setPendingDelete(role)}
            />
          );
        }}
      />
      <SettingsDeleteConfirmPopup
        open={pendingDelete !== null}
        title={t("web.deleteRoleConfirmPopup.title")}
        description={t("web.deleteRoleConfirmPopup.description")}
        confirmLabel={t("web.deleteRoleConfirmPopup.delete")}
        cancelLabel={t("web.newItemPopup.cancel")}
        closeLabel={t("web.settingsPopup.close")}
        deleting={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
