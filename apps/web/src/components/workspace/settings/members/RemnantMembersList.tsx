import type { CoreApiClient } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import {
  permissionAllowsObject,
  type WorkspaceMemberDto,
  type WorkspaceMembersPermissionCellDto,
} from "@okkey/types";
import { useState } from "react";

import { useSectionReauth } from "../../../../auth/SectionReauthContext";
import { runSaveWithToast } from "../../../../lib/saveWithToast";
import SettingsDeleteConfirmPopup from "../SettingsDeleteConfirmPopup";
import SettingsRowDeleteButton from "../SettingsRowDeleteButton";
import MembersListCard from "./MembersListCard";

type RemnantMembersListProps = {
  workspaceId: string;
  core: CoreApiClient;
  t: (messageKey: string, values?: WebMessageValues) => string;
  /** Non-owner active members and pending invitations. */
  members: readonly WorkspaceMemberDto[];
  actorId: string | null;
  permissions: WorkspaceMembersPermissionCellDto;
  onChanged: () => Promise<void> | void;
};

/**
 * Additional members and invitations left after enterprise modules were disabled (or the plan was downgraded):
 * still listed and removable / revocable, but no invites or edits.
 */
export default function RemnantMembersList({
  workspaceId,
  core,
  t,
  members,
  actorId,
  permissions,
  onChanged,
}: RemnantMembersListProps) {
  const { requestZoneUnlock } = useSectionReauth();
  const [pendingDelete, setPendingDelete] = useState<WorkspaceMemberDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canDelete = (member: WorkspaceMemberDto) => {
    const targetId = member.status === "pending" ? member.invitationId : member.userId;
    if (!targetId || (member.status === "active" && member.userId === actorId)) {
      return false;
    }
    return permissionAllowsObject(permissions.delete, Boolean(actorId && member.invitedBy?.userId === actorId));
  };

  async function confirmDelete() {
    if (!pendingDelete || deleting || !canDelete(pendingDelete)) {
      return;
    }
    if (!(await requestZoneUnlock("deletion", { persist: false }))) {
      return;
    }
    const target = pendingDelete;
    const isPending = target.status === "pending";
    setDeleting(true);
    try {
      await runSaveWithToast(
        {
          loading: isPending
            ? t("web.workspaceSettings.members.invite.revoking")
            : t("web.workspaceSettings.members.card.removing"),
          success: isPending
            ? t("web.workspaceSettings.members.invite.revoked")
            : t("web.workspaceSettings.members.card.removed"),
          error: t("web.toast.save.error"),
        },
        async () => {
          if (isPending && target.invitationId) {
            await core.revokeWorkspaceInvitation(workspaceId, target.invitationId);
          } else if (target.userId) {
            await core.deleteWorkspaceMember(workspaceId, target.userId);
          }
        },
      );
      setPendingDelete(null);
      await onChanged();
    } catch {
      /* toast */
    } finally {
      setDeleting(false);
    }
  }

  if (members.length === 0) {
    return null;
  }

  const pendingIsInvite = pendingDelete?.status === "pending";

  return (
    <>
      <MembersListCard
        members={members}
        t={t}
        listWindowResetKey={workspaceId}
        renderTrailing={(member) =>
          canDelete(member) ? (
            <SettingsRowDeleteButton
              label={
                member.status === "pending"
                  ? t("web.workspaceSettings.members.deleteConfirm.deleteInvite")
                  : t("web.workspaceSettings.members.deleteConfirm.deleteMember")
              }
              disabled={deleting}
              onClick={() => setPendingDelete(member)}
            />
          ) : null
        }
      />
      <SettingsDeleteConfirmPopup
        open={pendingDelete !== null}
        title={
          pendingIsInvite
            ? t("web.workspaceSettings.members.deleteConfirm.inviteTitle")
            : t("web.workspaceSettings.members.deleteConfirm.title")
        }
        description={
          pendingIsInvite
            ? t("web.workspaceSettings.members.deleteConfirm.inviteDescription")
            : t("web.workspaceSettings.members.deleteConfirm.description")
        }
        confirmLabel={t("web.workspaceSettings.members.deleteConfirm.delete")}
        cancelLabel={t("web.newItemPopup.cancel")}
        closeLabel={t("web.settingsPopup.close")}
        deleting={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
