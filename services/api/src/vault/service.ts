import type {
  VaultRecord,
  VaultsRepository,
  WorkspaceRecord,
  WorkspacesRepository,
} from "../storage/repositories.ts";

export class VaultServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface VaultServiceDeps {
  vaults: Pick<
    VaultsRepository,
    "findById" | "listAccessibleByWorkspace" | "canReadVault"
  >;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess" | "listAccessibleByUser">;
}

export class VaultService {
  private readonly vaults: VaultServiceDeps["vaults"];
  private readonly workspaces: VaultServiceDeps["workspaces"];

  constructor(deps: VaultServiceDeps) {
    this.vaults = deps.vaults;
    this.workspaces = deps.workspaces;
  }

  async listAccessibleWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
    return this.workspaces.listAccessibleByUser(userId);
  }

  async listWorkspaceVaults(
    workspaceId: string,
    userId: string,
  ): Promise<VaultRecord[]> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new VaultServiceError(
        "WORKSPACE_NOT_FOUND",
        404,
        "workspace not found",
      );
    }

    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    return this.vaults.listAccessibleByWorkspace(workspaceId, userId);
  }

  async getVault(vaultId: string, userId: string): Promise<VaultRecord> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }

    return vault;
  }
}
