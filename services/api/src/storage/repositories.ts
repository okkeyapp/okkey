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

  async hasAccess(workspaceId: string, userId: string): Promise<boolean> {
    const rows = await this.db.query<{ can_access: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM workspaces w
          LEFT JOIN workspace_members wm
            ON wm.workspace_id = w.id
           AND wm.user_id = $2
          WHERE w.id = $1
            AND (w.owner_id = $2 OR wm.user_id IS NOT NULL)
        ) AS can_access
      `,
      [workspaceId, userId],
    );
    return Boolean(rows[0]?.can_access);
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

  async listAccessibleByWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<VaultRecord[]> {
    const rows = await this.db.query<
      BaseRow & {
        workspace_id: string;
        name: string;
        is_personal: boolean;
        owner_id: string | null;
      }
    >(
      `
        SELECT DISTINCT
          v.id,
          v.workspace_id,
          v.name,
          v.is_personal,
          v.owner_id,
          v.created_at,
          v.updated_at
        FROM vaults v
        LEFT JOIN vault_members vm
          ON vm.vault_id = v.id
         AND vm.user_id = $2
        LEFT JOIN workspaces w
          ON w.id = v.workspace_id
        WHERE v.workspace_id = $1
          AND (
            w.owner_id = $2
            OR vm.user_id IS NOT NULL
            OR v.owner_id = $2
          )
        ORDER BY v.created_at ASC
      `,
      [workspaceId, userId],
    );
    return rows.map(mapVault);
  }

  async canReadVault(vaultId: string, userId: string): Promise<boolean> {
    const rows = await this.db.query<{ can_read: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM vaults v
          LEFT JOIN vault_members vm
            ON vm.vault_id = v.id
           AND vm.user_id = $2
          LEFT JOIN workspaces w
            ON w.id = v.workspace_id
          WHERE v.id = $1
            AND (
              w.owner_id = $2
              OR vm.user_id IS NOT NULL
              OR v.owner_id = $2
            )
        ) AS can_read
      `,
      [vaultId, userId],
    );
    return Boolean(rows[0]?.can_read);
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

export interface DeviceRecord {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  devicePublicKey: string;
  deviceShare: Uint8Array;
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  clientType: string;
  userAgent: string;
  ipFirst: string;
  ipLast: string;
  status: "trusted" | "pending" | "revoked";
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export class DevicesRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async registerOrUpdate(input: {
    userId: string;
    deviceFingerprint: string;
    deviceName: string;
    devicePublicKey: string;
    deviceShare: Uint8Array;
    platform: string;
    osName: string;
    osVersion: string;
    appVersion: string;
    clientType: string;
    userAgent: string;
    requestIp: string;
    now: string;
  }): Promise<DeviceRecord> {
    try {
      const rows = await this.db.query<{
        id: string;
        user_id: string;
        device_fingerprint: string;
        device_name: string;
        device_public_key: string;
        device_share: Buffer;
        platform: string;
        os_name: string;
        os_version: string;
        app_version: string;
        client_type: string;
        user_agent: string;
        ip_first: string;
        ip_last: string;
        status: "trusted" | "pending" | "revoked";
        created_at: string | Date;
        last_seen_at: string | Date | null;
        revoked_at: string | Date | null;
      }>(
        `
          INSERT INTO devices (
            user_id,
            device_fingerprint,
            device_name,
            device_public_key,
            device_share,
            platform,
            os_name,
            os_version,
            app_version,
            client_type,
            user_agent,
            ip_first,
            ip_last,
            status,
            last_seen_at,
            revoked_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $12,
            'pending',
            NULL,
            NULL
          )
          ON CONFLICT (user_id, device_fingerprint, device_public_key)
          DO UPDATE SET
            device_share = EXCLUDED.device_share,
            device_name = EXCLUDED.device_name,
            platform = EXCLUDED.platform,
            os_name = EXCLUDED.os_name,
            os_version = EXCLUDED.os_version,
            app_version = EXCLUDED.app_version,
            client_type = EXCLUDED.client_type,
            user_agent = EXCLUDED.user_agent,
            status = CASE
              WHEN devices.status = 'trusted' THEN 'trusted'
              ELSE 'pending'
            END,
            revoked_at = CASE
              WHEN devices.status = 'trusted' THEN devices.revoked_at
              ELSE NULL
            END,
            last_seen_at = CASE
              WHEN devices.status = 'trusted' THEN $13::timestamptz
              ELSE devices.last_seen_at
            END,
            ip_last = CASE
              WHEN devices.status = 'trusted' THEN EXCLUDED.ip_last
              ELSE devices.ip_last
            END
          RETURNING
            id,
            user_id,
            device_fingerprint,
            device_name,
            device_public_key,
            device_share,
            platform,
            os_name,
            os_version,
            app_version,
            client_type,
            user_agent,
            ip_first,
            ip_last,
            status,
            created_at,
            last_seen_at,
            revoked_at
        `,
        [
          input.userId,
          input.deviceFingerprint,
          input.deviceName,
          input.devicePublicKey,
          Buffer.from(input.deviceShare),
          input.platform,
          input.osName,
          input.osVersion,
          input.appVersion,
          input.clientType,
          input.userAgent,
          input.requestIp,
          input.now,
        ],
      );

      return mapDevice(rows[0]);
    } catch (error) {
      throw toUniqueError(error);
    }
  }
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

function mapDevice(row: {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_name: string;
  device_public_key: string;
  device_share: Buffer;
  platform: string;
  os_name: string;
  os_version: string;
  app_version: string;
  client_type: string;
  user_agent: string;
  ip_first: string;
  ip_last: string;
  status: "trusted" | "pending" | "revoked";
  created_at: string | Date;
  last_seen_at: string | Date | null;
  revoked_at: string | Date | null;
}): DeviceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    deviceFingerprint: row.device_fingerprint,
    deviceName: row.device_name,
    devicePublicKey: row.device_public_key,
    deviceShare: Uint8Array.from(row.device_share),
    platform: row.platform,
    osName: row.os_name,
    osVersion: row.os_version,
    appVersion: row.app_version,
    clientType: row.client_type,
    userAgent: row.user_agent,
    ipFirst: row.ip_first,
    ipLast: row.ip_last,
    status: row.status,
    createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
    lastSeenAt: toIsoString(row.last_seen_at),
    revokedAt: toIsoString(row.revoked_at),
  };
}

function toIsoString(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
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
