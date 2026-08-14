import type { QueryExecutor } from "../storage/postgres.ts";
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

export type VaultUpdateInput = {
  name?: string;
  description?: string;
  icon?: string;
};

export interface VaultServiceDeps {
  vaults: Pick<
    VaultsRepository,
    | "findById"
    | "listAccessibleByWorkspace"
    | "listByWorkspace"
    | "canReadVault"
    | "canManageVaultSettings"
    | "updateMetadata"
  >;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess" | "listAccessibleByUser">;
  db?: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
}

export class VaultService {
  private readonly vaults: VaultServiceDeps["vaults"];
  private readonly workspaces: VaultServiceDeps["workspaces"];
  private readonly db: VaultServiceDeps["db"];

  constructor(deps: VaultServiceDeps) {
    this.vaults = deps.vaults;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
  }

  async listAccessibleWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
    return this.workspaces.listAccessibleByUser(userId);
  }

  async listWorkspaceVaults(
    workspaceId: string,
    userId: string,
  ): Promise<VaultRecord[]> {
    const workspace = await this.requireWorkspaceAccess(workspaceId, userId);
    const canManageSettings = await this.canManageWorkspaceVaultSettings(workspace, userId);
    if (canManageSettings) {
      // Admins see every shared vault, but only their own personal vault.
      const all = await this.vaults.listByWorkspace(workspaceId);
      return all.filter((vault) => !vault.isPersonal || vault.ownerId === userId);
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

  async updateVault(
    vaultId: string,
    actorId: string,
    input: VaultUpdateInput,
  ): Promise<VaultRecord> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const workspace = await this.requireWorkspaceAccess(vault.workspaceId, actorId);
    if (vault.isPersonal) {
      if (vault.ownerId !== actorId && workspace.ownerId !== actorId) {
        throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
      }
    } else {
      const canManage = await this.vaults.canManageVaultSettings(vaultId, actorId);
      if (!canManage) {
        throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
      }
    }

    if (input.name !== undefined && !input.name.trim()) {
      throw new VaultServiceError("BAD_REQUEST", 400, "name cannot be empty");
    }

    const updated = await this.vaults.updateMetadata(vaultId, {
      name: input.name?.trim(),
      description: input.description !== undefined ? input.description.trim() : undefined,
      icon: input.icon !== undefined ? input.icon.trim() : undefined,
    });
    if (!updated) {
      throw new VaultServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }
    return updated;
  }

  private async requireWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new VaultServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new VaultServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }

  private async canManageWorkspaceVaultSettings(
    workspace: WorkspaceRecord,
    userId: string,
  ): Promise<boolean> {
    if (workspace.ownerId === userId) {
      return true;
    }
    if (!this.db) {
      return false;
    }
    const rows = await this.db.query<{ ok: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM workspace_members wm
          INNER JOIN roles r ON r.id = wm.role_id
          WHERE wm.workspace_id = $1
            AND wm.user_id = $2
            AND r.builtin_key IN ('owner', 'admin')
        ) AS ok
      `,
      [workspace.id, userId],
    );
    return Boolean(rows[0]?.ok);
  }
}
