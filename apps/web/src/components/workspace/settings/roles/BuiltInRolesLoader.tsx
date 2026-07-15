import type { CoreApiClient } from "@okkey/api";
import type { WorkspaceBuiltInRoleId } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { useCallback, useEffect, useState } from "react";

import { extractBuiltInMemberCounts } from "./builtinRoles";
import BuiltInRolesList from "./BuiltInRolesList";

type BuiltInRolesLoaderProps = {
  workspaceId: string;
  core: CoreApiClient;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

export default function BuiltInRolesLoader({ workspaceId, core, t }: BuiltInRolesLoaderProps) {
  const [memberCounts, setMemberCounts] = useState<Partial<Record<WorkspaceBuiltInRoleId, number>>>();
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await core.listWorkspaceRoles(workspaceId);
      setMemberCounts(extractBuiltInMemberCounts(response.roles));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "failed to load roles");
      setMemberCounts(undefined);
    }
  }, [core, workspaceId]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  return <BuiltInRolesList t={t} memberCounts={memberCounts} loadError={loadError} onRetry={loadRoles} />;
}
