import type { DeploymentMode } from "../config.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";

export class WorkspacePolicyError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "WorkspacePolicyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Self-hosted OSS: owner may have at most one workspace.
 * SaaS: no count limit here (create itself is only exposed via enterprise tenancy plugin).
 */
export async function assertCanCreateWorkspace(input: {
  deploymentMode: DeploymentMode;
  ownerId: string;
  workspaces: Pick<WorkspacesRepository, "countOwnedByUser">;
}): Promise<void> {
  if (input.deploymentMode !== "self_hosted") {
    return;
  }
  const owned = await input.workspaces.countOwnedByUser(input.ownerId);
  if (owned >= 1) {
    throw new WorkspacePolicyError(
      "WORKSPACE_LIMIT_REACHED",
      403,
      "self-hosted deployments allow only one workspace per owner",
    );
  }
}
