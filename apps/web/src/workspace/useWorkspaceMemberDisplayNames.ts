import { useCallback, useEffect, useState } from "react";

import { useAuthenticatedCoreClient } from "../auth/AuthVaultContext";
import { memberDisplayName } from "../components/workspace/settings/vaults/vaultAccessHelpers";

/**
 * Maps workspace member userIds → display names for activity / audit labels.
 * Uses member-directory (any workspace member), not admin-gated /members.
 */
export function useWorkspaceMemberDisplayNames(workspaceId: string | undefined): {
  resolveMemberDisplayName: (userId: string | null | undefined) => string | null;
  ready: boolean;
} {
  const core = useAuthenticatedCoreClient();
  const [labelsByUserId, setLabelsByUserId] = useState<Map<string, string>>(() => new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!core || !workspaceId) {
      setLabelsByUserId(new Map());
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);
    void core
      .listWorkspaceMemberDirectory(workspaceId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const next = new Map<string, string>();
        for (const member of response.members) {
          next.set(
            member.userId,
            memberDisplayName({
              firstName: member.firstName,
              lastName: member.lastName,
              email: member.email,
            }),
          );
        }
        setLabelsByUserId(next);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLabelsByUserId(new Map());
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [core, workspaceId]);

  const resolveMemberDisplayName = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) {
        return null;
      }
      return labelsByUserId.get(userId) ?? null;
    },
    [labelsByUserId],
  );

  return { resolveMemberDisplayName, ready };
}
