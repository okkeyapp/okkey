import type { CoreApiClient } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import {
  permissionAllowsObject,
  type WorkspaceCustomProfileRemnantDto,
  type WorkspaceProfileSummary,
  type WorkspaceResourcePermissionDto,
} from "@okkey/types";
import { useCallback, useEffect, useState } from "react";

import { useAuthVault } from "../../../../auth/AuthVaultContext";
import { useSectionReauth } from "../../../../auth/SectionReauthContext";
import { runSaveWithToast } from "../../../../lib/saveWithToast";
import SettingsDeleteConfirmPopup from "../SettingsDeleteConfirmPopup";
import SettingsRowDeleteButton from "../SettingsRowDeleteButton";
import ProfilesListCard from "./ProfilesListCard";

type RemnantCustomProfilesListProps = {
  workspaceId: string;
  core: CoreApiClient;
  t: (messageKey: string, values?: WebMessageValues) => string;
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
};

/**
 * Custom profiles left after enterprise modules were disabled (or the plan was downgraded):
 * still listed and removable, but not editable.
 */
export default function RemnantCustomProfilesList({
  workspaceId,
  core,
  t,
  resourcePermissions = null,
}: RemnantCustomProfilesListProps) {
  const { userId } = useAuthVault();
  const { requestZoneUnlock } = useSectionReauth();
  const [profiles, setProfiles] = useState<WorkspaceCustomProfileRemnantDto[]>([]);
  const [pendingDelete, setPendingDelete] = useState<WorkspaceCustomProfileRemnantDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await core.listWorkspaceProfiles(workspaceId);
      setProfiles(
        response.profiles.filter(
          (profile): profile is WorkspaceCustomProfileRemnantDto => profile.kind === "custom",
        ),
      );
    } catch {
      setProfiles([]);
    }
  }, [core, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteLevel = resourcePermissions?.delete ?? 0;
  const canDelete = (profile: WorkspaceCustomProfileRemnantDto) =>
    permissionAllowsObject(deleteLevel, Boolean(userId && profile.created_by === userId));

  async function confirmDelete() {
    if (!pendingDelete || deleting || !canDelete(pendingDelete)) {
      return;
    }
    if (!(await requestZoneUnlock("deletion", { persist: false }))) {
      return;
    }
    const profileId = pendingDelete.id;
    setDeleting(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.toast.save.error"),
        },
        () => core.deleteWorkspaceProfile(workspaceId, profileId),
      );
      setProfiles((current) => current.filter((profile) => profile.id !== profileId));
      setPendingDelete(null);
    } catch {
      /* toast */
    } finally {
      setDeleting(false);
    }
  }

  if (profiles.length === 0) {
    return null;
  }

  const summaries: WorkspaceProfileSummary[] = profiles.map((profile) => ({
    id: profile.id,
    kind: "custom",
    name: profile.name,
    description: profile.description,
    applicationCount: profile.application_count,
  }));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const deleteLabel = t("web.workspaceSettings.profiles.actions.deleteProfile");

  return (
    <>
      <ProfilesListCard
        profiles={summaries}
        t={t}
        listWindowResetKey={workspaceId}
        renderTrailing={(summary) => {
          const profile = profilesById.get(summary.id);
          if (!profile || !canDelete(profile)) {
            return null;
          }
          return (
            <SettingsRowDeleteButton
              label={deleteLabel}
              disabled={deleting}
              onClick={() => setPendingDelete(profile)}
            />
          );
        }}
      />
      <SettingsDeleteConfirmPopup
        open={pendingDelete !== null}
        title={t("web.deleteProfileConfirmPopup.title")}
        description={t("web.deleteProfileConfirmPopup.description")}
        confirmLabel={t("web.deleteProfileConfirmPopup.delete")}
        cancelLabel={t("web.newItemPopup.cancel")}
        closeLabel={t("web.settingsPopup.close")}
        deleting={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
