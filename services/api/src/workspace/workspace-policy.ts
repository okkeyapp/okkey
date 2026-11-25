import type { DeploymentMode } from "../config.ts";

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
 * Self-hosted: workspace creation is never available via the create API.
 * The single instance workspace is created only during first-run setup registration.
 * SaaS: no count limit here (create itself is only exposed via enterprise tenancy plugin).
 */
export async function assertCanCreateWorkspace(input: {
  deploymentMode: DeploymentMode;
}): Promise<void> {
  if (input.deploymentMode !== "self_hosted") {
    return;
  }
  throw new WorkspacePolicyError(
    "WORKSPACE_CREATE_DISABLED",
    403,
    "self-hosted deployments use a single instance workspace; creation is disabled",
  );
}
