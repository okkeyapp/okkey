import { toast } from "sonner";

type CreateWorkspaceResult = {
  id: string;
  name: string;
  ownerId: string;
  planTier: string;
  vaultId: string;
};

type CreateWorkspaceClient = {
  createWorkspace(body: {
    name: string;
    personal_vault_name?: string;
  }): Promise<CreateWorkspaceResult>;
};

/**
 * SaaS `POST /workspaces` (enterprise tenancy plugin).
 * Keeps callers responsible for UI submitting state and navigation.
 */
export async function createWorkspaceRequest(
  core: CreateWorkspaceClient,
  name: string,
  personalVaultName: string,
): Promise<CreateWorkspaceResult> {
  return core.createWorkspace({
    name: name.trim(),
    personal_vault_name: personalVaultName.trim() || undefined,
  });
}

export function toastWorkspaceCreated(message: string): void {
  toast.success(message);
}
