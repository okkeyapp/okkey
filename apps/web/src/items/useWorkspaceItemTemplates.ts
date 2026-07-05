import type { WorkspaceItemTemplateDto } from "@okkey/types";
import { useCallback, useEffect, useState } from "react";

import { useAuthenticatedCoreClient } from "../auth/AuthVaultContext";

export function useWorkspaceItemTemplates(workspaceId: string | null) {
  const core = useAuthenticatedCoreClient();
  const [templates, setTemplates] = useState<WorkspaceItemTemplateDto[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!core || !workspaceId) {
      setTemplates([]);
      setReady(false);
      return;
    }
    const response = await core.listWorkspaceItemTemplates(workspaceId);
    setTemplates(response.templates);
    setReady(true);
  }, [core, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        if (!core || !workspaceId) {
          if (!cancelled) {
            setTemplates([]);
          }
          return;
        }
        const response = await core.listWorkspaceItemTemplates(workspaceId);
        if (!cancelled) {
          setTemplates(response.templates);
        }
      } catch {
        if (!cancelled) {
          setTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, workspaceId]);

  return { templates, ready, refresh };
}
