import { toast } from "sonner";

type CreateWorkspaceResult = {
  id: string;
  name: string;
  ownerId: string;
  planTier: string;
  vaultId: string;
};

type CreateWorkspaceClient = {
  createWorkspace(body: { name: string }): Promise<CreateWorkspaceResult>;
};

/**
 * SaaS `POST /workspaces` (enterprise tenancy plugin).
 * Keeps callers responsible for UI submitting state and navigation.
 */
export async function createWorkspaceRequest(
  core: CreateWorkspaceClient,
  name: string,
): Promise<CreateWorkspaceResult> {
  return core.createWorkspace({ name: name.trim() });
}

export function toastWorkspaceCreated(message: string): void {
  toast.success(message);
}
