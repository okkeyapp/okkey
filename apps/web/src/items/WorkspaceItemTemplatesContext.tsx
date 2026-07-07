import type { WorkspaceItemTemplateDto } from "@okkey/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useAuthenticatedCoreClient } from "../auth/AuthVaultContext";

export type WorkspaceItemTemplatesContextValue = {
  templates: WorkspaceItemTemplateDto[];
  ready: boolean;
  refresh: () => Promise<void>;
};

const WorkspaceItemTemplatesContext = createContext<WorkspaceItemTemplatesContextValue | null>(null);

export function useWorkspaceItemTemplatesState(
  workspaceId: string | null,
): WorkspaceItemTemplatesContextValue {
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

export function WorkspaceItemTemplatesProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const value = useWorkspaceItemTemplatesState(workspaceId);
  return (
    <WorkspaceItemTemplatesContext.Provider value={value}>{children}</WorkspaceItemTemplatesContext.Provider>
  );
}

export function useWorkspaceItemTemplates(): WorkspaceItemTemplatesContextValue {
  const ctx = useContext(WorkspaceItemTemplatesContext);
  if (!ctx) {
    throw new Error("useWorkspaceItemTemplates must be used within WorkspaceItemTemplatesProvider");
  }
  return ctx;
}
