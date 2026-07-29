import type { CoreApiClient } from "@okkey/api";
import type { WorkspaceBuiltInProfileId } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";

import { extractBuiltInApplicationCounts } from "./builtinProfiles";
import BuiltInProfilesList, { type BuiltInProfileCardPopupProps } from "./BuiltInProfilesList";

type BuiltInProfilesLoaderProps = {
  workspaceId: string;
  core: CoreApiClient;
  t: (messageKey: string, values?: WebMessageValues) => string;
  rolesLink?: ReactNode;
  ProfileCardPopup?: ComponentType<BuiltInProfileCardPopupProps>;
};

export default function BuiltInProfilesLoader({
  workspaceId,
  core,
  t,
  rolesLink,
  ProfileCardPopup,
}: BuiltInProfilesLoaderProps) {
  const [applicationCounts, setApplicationCounts] =
    useState<Partial<Record<WorkspaceBuiltInProfileId, number>>>();
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await core.listWorkspaceProfiles(workspaceId);
      setApplicationCounts(extractBuiltInApplicationCounts(response.profiles));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "failed to load profiles");
      setApplicationCounts(undefined);
    }
  }, [core, workspaceId]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  return (
    <BuiltInProfilesList
      t={t}
      applicationCounts={applicationCounts}
      loadError={loadError}
      onRetry={loadProfiles}
      rolesLink={rolesLink}
      ProfileCardPopup={ProfileCardPopup}
    />
  );
}
