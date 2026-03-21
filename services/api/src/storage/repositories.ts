import type { QueryExecutor } from "./postgres.ts";
import {
  EntityNotFoundError,
  UniqueConstraintError,
  VersionConflictError,
} from "./errors.ts";

interface BaseRow {
  id: string;
  created_at: string;
  updated_at?: string;
}

function toUniqueError(error: unknown): Error {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  ) {
    return new UniqueConstraintError("unique constraint violated");
  }
  return error instanceof Error ? error : new Error("storage operation failed");
}

export interface UserRecord {
  id: string;
  email: string;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
}

export class UsersRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async create(input: {
    email: string;
    publicKey: string;
    encryptedPrivateKey: Uint8Array;
    serverKeyShare: Uint8Array;
  }): Promise<UserRecord> {
    try {
      const rows = await this.db.query<
        BaseRow & { email: string; public_key: string }
      >(
        `
          INSERT INTO users (email, public_key, encrypted_private_key, server_key_share)
          VALUES ($1, $2, $3, $4)
          RETURNING id, email, public_key, created_at, updated_at
        `,
        [
          input.email,
          input.publicKey,
          Buffer.from(input.encryptedPrivateKey),
          Buffer.from(input.serverKeyShare),
        ],
      );

      return mapUser(rows[0]);
    } catch (error) {
      throw toUniqueError(error);
    }
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.query<BaseRow & { email: string; public_key: string }>(
      "SELECT id, email, public_key, created_at, updated_at FROM users WHERE id = $1",
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db.query<BaseRow & { email: string; public_key: string }>(
      "SELECT id, email, public_key, created_at, updated_at FROM users WHERE email = $1",
      [email],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  ownerId: string;
  planTier: string;
  createdAt: string;
  updatedAt: string;
}

export class WorkspacesRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async create(input: {
    name: string;
    ownerId: string;
    planTier?: string;
  }): Promise<WorkspaceRecord> {
    const rows = await this.db.query<
      BaseRow & { name: string; owner_id: string; plan_tier: string }
    >(
      `
        INSERT INTO workspaces (name, owner_id, plan_tier)
        VALUES ($1, $2, $3)
        RETURNING id, name, owner_id, plan_tier, created_at, updated_at
      `,
      [input.name, input.ownerId, input.planTier ?? "FREE"],
    );
    return mapWorkspace(rows[0]);
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    const rows = await this.db.query<
      BaseRow & { name: string; owner_id: string; plan_tier: string }
    >(
      "SELECT id, name, owner_id, plan_tier, created_at, updated_at FROM workspaces WHERE id = $1",
      [id],
    );
    return rows[0] ? mapWorkspace(rows[0]) : null;
  }

  async listByOwner(ownerId: string): Promise<WorkspaceRecord[]> {
    const rows = await this.db.query<
      BaseRow & { name: string; owner_id: string; plan_tier: string }
    >(
      `
        SELECT id, name, owner_id, plan_tier, created_at, updated_at
        FROM workspaces
        WHERE owner_id = $1
        ORDER BY created_at ASC
      `,
      [ownerId],
    );
    return rows.map(mapWorkspace);
  }
}

export interface VaultRecord {
  id: string;
  workspaceId: string;
  name: string;
  isPersonal: boolean;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class VaultsRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async create(input: {
    workspaceId: string;
    name: string;
    isPersonal?: boolean;
    ownerId?: string | null;
  }): Promise<VaultRecord> {
    const rows = await this.db.query<
      BaseRow & {
        workspace_id: string;
        name: string;
        is_personal: boolean;
        owner_id: string | null;
      }
    >(
      `
        INSERT INTO vaults (workspace_id, name, is_personal, owner_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, workspace_id, name, is_personal, owner_id, created_at, updated_at
      `,
      [input.workspaceId, input.name, input.isPersonal ?? false, input.ownerId ?? null],
    );
    return mapVault(rows[0]);
  }

  async findById(id: string): Promise<VaultRecord | null> {
    const rows = await this.db.query<
      BaseRow & {
        workspace_id: string;
        name: string;
        is_personal: boolean;
        owner_id: string | null;
      }
    >(
      `
        SELECT id, workspace_id, name, is_personal, owner_id, created_at, updated_at
        FROM vaults
        WHERE id = $1
      `,
      [id],
    );
    return rows[0] ? mapVault(rows[0]) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<VaultRecord[]> {
    const rows = await this.db.query<
      BaseRow & {
        workspace_id: string;
        name: string;
        is_personal: boolean;
        owner_id: string | null;
      }
    >(
      `
        SELECT id, workspace_id, name, is_personal, owner_id, created_at, updated_at
        FROM vaults
        WHERE workspace_id = $1
        ORDER BY created_at ASC
      `,
      [workspaceId],
    );
    return rows.map(mapVault);
  }
}

export interface ItemRecord {
  id: string;
  vaultId: string;
  encryptedData: Uint8Array;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class ItemsRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async create(input: {
    vaultId: string;
    encryptedData: Uint8Array;
    version?: number;
  }): Promise<ItemRecord> {
    const rows = await this.db.query<
      BaseRow & { vault_id: string; encrypted_data: Buffer; version: number }
    >(
      `
        INSERT INTO items (vault_id, encrypted_data, version)
        VALUES ($1, $2, $3)
        RETURNING id, vault_id, encrypted_data, version, created_at, updated_at
      `,
      [input.vaultId, Buffer.from(input.encryptedData), input.version ?? 1],
    );
    return mapItem(rows[0]);
  }

  async findById(id: string): Promise<ItemRecord | null> {
    const rows = await this.db.query<
      BaseRow & { vault_id: string; encrypted_data: Buffer; version: number }
    >(
      "SELECT id, vault_id, encrypted_data, version, created_at, updated_at FROM items WHERE id = $1",
      [id],
    );
    return rows[0] ? mapItem(rows[0]) : null;
  }

  async listByVault(vaultId: string): Promise<ItemRecord[]> {
    const rows = await this.db.query<
      BaseRow & { vault_id: string; encrypted_data: Buffer; version: number }
    >(
      `
        SELECT id, vault_id, encrypted_data, version, created_at, updated_at
        FROM items
        WHERE vault_id = $1
        ORDER BY created_at ASC
      `,
      [vaultId],
    );
    return rows.map(mapItem);
  }
}

export interface EventRecord {
  id: string;
  vaultId: string;
  actorId: string | null;
  eventType: string;
  encryptedPayload: Uint8Array;
  version: number;
  createdAt: string;
}

export class EventsRepository {
  private readonly db: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };

  constructor(
    db: QueryExecutor & {
      transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
    },
  ) {
    this.db = db;
  }

  async append(input: {
    vaultId: string;
    actorId?: string | null;
    eventType: string;
    encryptedPayload: Uint8Array;
    baseVersion: number;
  }): Promise<EventRecord> {
    return this.db.transaction(async (tx) => {
      const vaultRows = await tx.query<{ id: string }>(
        "SELECT id FROM vaults WHERE id = $1 FOR UPDATE",
        [input.vaultId],
      );
      if (!vaultRows[0]) {
        throw new EntityNotFoundError("vault", input.vaultId);
      }

      const versionRows = await tx.query<{ current_version: number }>(
        "SELECT COALESCE(MAX(version), 0) AS current_version FROM events WHERE vault_id = $1",
        [input.vaultId],
      );
      const currentVersion = Number(versionRows[0]?.current_version ?? 0);
      if (input.baseVersion !== currentVersion) {
        throw new VersionConflictError(input.baseVersion, currentVersion);
      }

      const nextVersion = currentVersion + 1;
      const rows = await tx.query<{
        id: string;
        vault_id: string;
        actor_id: string | null;
        event_type: string;
        encrypted_payload: Buffer;
        version: number;
        created_at: string;
      }>(
        `
          INSERT INTO events (vault_id, actor_id, event_type, encrypted_payload, version)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, vault_id, actor_id, event_type, encrypted_payload, version, created_at
        `,
        [
          input.vaultId,
          input.actorId ?? null,
          input.eventType,
          Buffer.from(input.encryptedPayload),
          nextVersion,
        ],
      );

      return mapEvent(rows[0]);
    });
  }

  async listAfterVersion(vaultId: string, afterVersion: number): Promise<EventRecord[]> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      actor_id: string | null;
      event_type: string;
      encrypted_payload: Buffer;
      version: number;
      created_at: string;
    }>(
      `
        SELECT id, vault_id, actor_id, event_type, encrypted_payload, version, created_at
        FROM events
        WHERE vault_id = $1 AND version > $2
        ORDER BY version ASC
      `,
      [vaultId, afterVersion],
    );
    return rows.map(mapEvent);
  }
}

function mapUser(row: BaseRow & { email: string; public_key: string }): UserRecord {
  return {
    id: row.id,
    email: row.email,
    publicKey: row.public_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function mapWorkspace(
  row: BaseRow & { name: string; owner_id: string; plan_tier: string },
): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    planTier: row.plan_tier,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function mapVault(
  row: BaseRow & {
    workspace_id: string;
    name: string;
    is_personal: boolean;
    owner_id: string | null;
  },
): VaultRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    isPersonal: row.is_personal,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function mapItem(
  row: BaseRow & { vault_id: string; encrypted_data: Buffer; version: number },
): ItemRecord {
  return {
    id: row.id,
    vaultId: row.vault_id,
    encryptedData: Uint8Array.from(row.encrypted_data),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function mapEvent(row: {
  id: string;
  vault_id: string;
  actor_id: string | null;
  event_type: string;
  encrypted_payload: Buffer;
  version: number;
  created_at: string;
}): EventRecord {
  return {
    id: row.id,
    vaultId: row.vault_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    encryptedPayload: Uint8Array.from(row.encrypted_payload),
    version: row.version,
    createdAt: row.created_at,
  };
}
