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
  /** Preferred language for email (`en` | `ru`); null if unset */
  locale: string | null;
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
    passwordKdfSalt: Uint8Array;
    passwordKdfParamsVersion: number;
  }): Promise<UserRecord> {
    try {
      const rows = await this.db.query<
        BaseRow & { email: string; public_key: string }
      >(
        `
          INSERT INTO users (
            email,
            public_key,
            encrypted_private_key,
            server_key_share,
            password_kdf_salt,
            password_kdf_params_version
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, email, public_key, locale, created_at, updated_at
        `,
        [
          input.email,
          input.publicKey,
          Buffer.from(input.encryptedPrivateKey),
          Buffer.from(input.serverKeyShare),
          Buffer.from(input.passwordKdfSalt),
          input.passwordKdfParamsVersion,
        ],
      );

      return mapUser(rows[0]);
    } catch (error) {
      throw toUniqueError(error);
    }
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.query<
      BaseRow & { email: string; public_key: string; locale: string | null }
    >(
      "SELECT id, email, public_key, locale, created_at, updated_at FROM users WHERE id = $1",
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db.query<
      BaseRow & { email: string; public_key: string; locale: string | null }
    >(
      "SELECT id, email, public_key, locale, created_at, updated_at FROM users WHERE email = $1",
      [email],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const rows = await this.db.query<{ enabled: boolean }>(
      "SELECT (two_factor_enabled_at IS NOT NULL) AS enabled FROM users WHERE id = $1",
      [userId],
    );
    return Boolean(rows[0]?.enabled);
  }

  async setTwoFactorEnabled(userId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await this.db.query(
        "UPDATE users SET two_factor_enabled_at = now(), updated_at = now() WHERE id = $1",
        [userId],
      );
    } else {
      await this.db.query(
        "UPDATE users SET two_factor_enabled_at = NULL, updated_at = now() WHERE id = $1",
        [userId],
      );
    }
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
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  revokedAt: string | null;
}

export interface DeviceApprovalState {
  kind:
    | "approved"
    | "rejected"
    | "expired"
    | "already_trusted"
    | "already_revoked"
    | "not_found"
    | "access_denied";
  device: DeviceRecord | null;
}

export class DevicesRepository {
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
        approved_by: string | null;
        approved_at: string | Date | null;
        rejected_at: string | Date | null;
        rejection_reason: string | null;
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
            approved_by = CASE
              WHEN devices.status = 'trusted' THEN devices.approved_by
              ELSE NULL
            END,
            approved_at = CASE
              WHEN devices.status = 'trusted' THEN devices.approved_at
              ELSE NULL
            END,
            rejected_at = CASE
              WHEN devices.status = 'trusted' THEN devices.rejected_at
              ELSE NULL
            END,
            rejection_reason = CASE
              WHEN devices.status = 'trusted' THEN devices.rejection_reason
              ELSE NULL
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
            approved_by,
            approved_at,
            rejected_at,
            rejection_reason,
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

  async isTrustedDevice(userId: string, deviceId: string): Promise<boolean> {
    const rows = await this.db.query<{ is_trusted: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM devices
          WHERE id = $1
            AND user_id = $2
            AND status = 'trusted'
        ) AS is_trusted
      `,
      [deviceId, userId],
    );
    return Boolean(rows[0]?.is_trusted);
  }

  async resolveApproval(input: {
    deviceId: string;
    userId: string;
    action: "approve" | "reject";
    now: string;
    expiresAt: string;
    approvedBy: string;
    rejectReason?: string;
  }): Promise<DeviceApprovalState> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<{
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
        approved_by: string | null;
        approved_at: string | Date | null;
        rejected_at: string | Date | null;
        rejection_reason: string | null;
        revoked_at: string | Date | null;
      }>(
        `
          SELECT
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
            approved_by,
            approved_at,
            rejected_at,
            rejection_reason,
            revoked_at
          FROM devices
          WHERE id = $1
          FOR UPDATE
        `,
        [input.deviceId],
      );

      const current = rows[0];
      if (!current) {
        return { kind: "not_found", device: null };
      }
      if (current.user_id !== input.userId) {
        return { kind: "access_denied", device: mapDevice(current) };
      }
      if (current.status === "trusted") {
        return { kind: "already_trusted", device: mapDevice(current) };
      }
      if (current.status === "revoked") {
        return { kind: "already_revoked", device: mapDevice(current) };
      }

      const createdAt = new Date(current.created_at);
      if (createdAt.getTime() < new Date(input.expiresAt).getTime()) {
        const expiredRows = await tx.query<{
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
          approved_by: string | null;
          approved_at: string | Date | null;
          rejected_at: string | Date | null;
          rejection_reason: string | null;
          revoked_at: string | Date | null;
        }>(
          `
            UPDATE devices
            SET
              status = 'revoked',
              rejected_at = COALESCE(rejected_at, $2::timestamptz),
              rejection_reason = COALESCE(rejection_reason, 'approval expired'),
              revoked_at = COALESCE(revoked_at, $2::timestamptz)
            WHERE id = $1
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
              approved_by,
              approved_at,
              rejected_at,
              rejection_reason,
              revoked_at
          `,
          [input.deviceId, input.now],
        );
        return { kind: "expired", device: mapDevice(expiredRows[0]) };
      }

      if (input.action === "approve") {
        const approvedRows = await tx.query<{
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
          approved_by: string | null;
          approved_at: string | Date | null;
          rejected_at: string | Date | null;
          rejection_reason: string | null;
          revoked_at: string | Date | null;
        }>(
          `
            UPDATE devices
            SET
              status = 'trusted',
              approved_by = $2,
              approved_at = $3::timestamptz,
              last_seen_at = $3::timestamptz,
              rejected_at = NULL,
              rejection_reason = NULL,
              revoked_at = NULL
            WHERE id = $1
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
              approved_by,
              approved_at,
              rejected_at,
              rejection_reason,
              revoked_at
          `,
          [input.deviceId, input.approvedBy, input.now],
        );
        return { kind: "approved", device: mapDevice(approvedRows[0]) };
      }

      const rejectedRows = await tx.query<{
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
        approved_by: string | null;
        approved_at: string | Date | null;
        rejected_at: string | Date | null;
        rejection_reason: string | null;
        revoked_at: string | Date | null;
      }>(
        `
          UPDATE devices
          SET
            status = 'revoked',
            rejected_at = $2::timestamptz,
            rejection_reason = $3,
            revoked_at = $2::timestamptz
          WHERE id = $1
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
            approved_by,
            approved_at,
            rejected_at,
            rejection_reason,
            revoked_at
        `,
        [input.deviceId, input.now, input.rejectReason ?? "rejected by user"],
      );
      return { kind: "rejected", device: mapDevice(rejectedRows[0]) };
    });
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
  payloadSchemaVersion: number;
  idempotencyKey: string | null;
  clientCreatedAt: string | null;
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
    payloadSchemaVersion?: number;
    idempotencyKey?: string | null;
    clientCreatedAt?: string | null;
  }): Promise<EventRecord> {
    return this.db.transaction(async (tx) => {
      const vaultRows = await tx.query<{ id: string }>(
        "SELECT id FROM vaults WHERE id = $1 FOR UPDATE",
        [input.vaultId],
      );
      if (!vaultRows[0]) {
        throw new EntityNotFoundError("vault", input.vaultId);
      }

      if (input.idempotencyKey) {
        const existingRows = await tx.query<{
          id: string;
          vault_id: string;
          actor_id: string | null;
          event_type: string;
          encrypted_payload: Buffer;
          payload_schema_version: number;
          idempotency_key: string | null;
          client_created_at: string | null;
          version: number;
          created_at: string;
        }>(
          `
            SELECT id, vault_id, actor_id, event_type, encrypted_payload,
                   payload_schema_version, idempotency_key, client_created_at, version, created_at
            FROM events
            WHERE vault_id = $1 AND idempotency_key = $2::uuid
            FOR UPDATE
          `,
          [input.vaultId, input.idempotencyKey],
        );
        if (existingRows[0]) {
          return mapEvent(existingRows[0]);
        }
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
      const payloadSchemaVersion = input.payloadSchemaVersion ?? 2;

      type EventRow = {
        id: string;
        vault_id: string;
        actor_id: string | null;
        event_type: string;
        encrypted_payload: Buffer;
        payload_schema_version: number;
        idempotency_key: string | null;
        client_created_at: string | null;
        version: number;
        created_at: string;
      };

      const selectByIdempotency = () =>
        tx.query<EventRow>(
          `
            SELECT id, vault_id, actor_id, event_type, encrypted_payload,
                   payload_schema_version, idempotency_key, client_created_at, version, created_at
            FROM events
            WHERE vault_id = $1 AND idempotency_key = $2::uuid
            FOR UPDATE
          `,
          [input.vaultId, input.idempotencyKey!],
        );

      let rows: EventRow[];
      try {
        rows = await tx.query<EventRow>(
          `
          INSERT INTO events (
            vault_id, actor_id, event_type, encrypted_payload, version,
            payload_schema_version, idempotency_key, client_created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, vault_id, actor_id, event_type, encrypted_payload,
                    payload_schema_version, idempotency_key, client_created_at, version, created_at
        `,
          [
            input.vaultId,
            input.actorId ?? null,
            input.eventType,
            Buffer.from(input.encryptedPayload),
            nextVersion,
            payloadSchemaVersion,
            input.idempotencyKey ?? null,
            input.clientCreatedAt ?? null,
          ],
        );
      } catch (error) {
        if (
          input.idempotencyKey &&
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "23505"
        ) {
          const retryRows = await selectByIdempotency();
          if (retryRows[0]) {
            return mapEvent(retryRows[0]);
          }
        }
        throw error;
      }

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
      payload_schema_version: number;
      idempotency_key: string | null;
      client_created_at: string | null;
      version: number;
      created_at: string;
    }>(
      `
        SELECT id, vault_id, actor_id, event_type, encrypted_payload,
               payload_schema_version, idempotency_key, client_created_at, version, created_at
        FROM events
        WHERE vault_id = $1 AND version > $2
        ORDER BY version ASC
      `,
      [vaultId, afterVersion],
    );
    return rows.map(mapEvent);
  }
}

export class TwoFactorRepository {
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

  async upsertTotpSecret(
    userId: string,
    encryptedSecret: Uint8Array,
    executor?: QueryExecutor,
  ): Promise<void> {
    const ex = executor ?? this.db;
    await ex.query(
      `
        INSERT INTO user_totp_credentials (user_id, encrypted_secret)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET
          encrypted_secret = EXCLUDED.encrypted_secret,
          created_at = now()
      `,
      [userId, Buffer.from(encryptedSecret)],
    );
  }

  async enableTotpWithFreshBackupCodes(
    userId: string,
    encryptedSecret: Uint8Array,
    backupHashes: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.deleteTotpForUser(userId, tx);
      await this.deleteBackupCodesForUser(userId, tx);
      await this.upsertTotpSecret(userId, encryptedSecret, tx);
      await this.insertBackupCodes(userId, backupHashes, tx);
    });
  }

  async disableTotpAndBackupCodes(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.deleteTotpForUser(userId, tx);
      await this.deleteBackupCodesForUser(userId, tx);
    });
  }

  async getEncryptedTotpSecret(userId: string): Promise<Uint8Array | null> {
    const rows = await this.db.query<{ encrypted_secret: Buffer }>(
      "SELECT encrypted_secret FROM user_totp_credentials WHERE user_id = $1",
      [userId],
    );
    const row = rows[0];
    return row ? Uint8Array.from(row.encrypted_secret) : null;
  }

  async deleteTotpForUser(userId: string, executor?: QueryExecutor): Promise<void> {
    const ex = executor ?? this.db;
    await ex.query("DELETE FROM user_totp_credentials WHERE user_id = $1", [userId]);
  }

  async deleteBackupCodesForUser(userId: string, executor?: QueryExecutor): Promise<void> {
    const ex = executor ?? this.db;
    await ex.query("DELETE FROM user_backup_codes WHERE user_id = $1", [userId]);
  }

  async insertBackupCodes(
    userId: string,
    codeHashes: string[],
    executor?: QueryExecutor,
  ): Promise<void> {
    const ex = executor ?? this.db;
    for (const h of codeHashes) {
      await ex.query(
        "INSERT INTO user_backup_codes (user_id, code_hash) VALUES ($1, $2)",
        [userId, h],
      );
    }
  }

  async countUnusedBackupCodes(userId: string): Promise<number> {
    const rows = await this.db.query<{ n: string }>(
      `
        SELECT count(*)::text AS n
        FROM user_backup_codes
        WHERE user_id = $1 AND used_at IS NULL
      `,
      [userId],
    );
    return Number(rows[0]?.n ?? "0");
  }

  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `
        UPDATE user_backup_codes AS ubc
        SET used_at = now()
        FROM (
          SELECT id FROM user_backup_codes
          WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
          LIMIT 1
        ) AS picked
        WHERE ubc.id = picked.id
        RETURNING ubc.id
      `,
      [userId, codeHash],
    );
    return Boolean(rows[0]);
  }

  async replaceBackupCodesOnly(userId: string, backupHashes: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.deleteBackupCodesForUser(userId, tx);
      await this.insertBackupCodes(userId, backupHashes, tx);
    });
  }
}

export class SessionsRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAtIso: string;
  }): Promise<{ id: string }> {
    const rows = await this.db.query<{ id: string }>(
      `
        INSERT INTO sessions (user_id, device_id, token_hash, expires_at)
        VALUES ($1, NULL, $2, $3::timestamptz)
        RETURNING id
      `,
      [input.userId, input.tokenHash, input.expiresAtIso],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("session insert failed");
    }
    return { id: row.id };
  }

  async findValidByTokenHash(
    tokenHash: string,
    nowIso: string,
  ): Promise<{ id: string; userId: string } | null> {
    const rows = await this.db.query<{ id: string; user_id: string }>(
      `
        SELECT id, user_id
        FROM sessions
        WHERE token_hash = $1 AND expires_at > $2::timestamptz
        LIMIT 1
      `,
      [tokenHash, nowIso],
    );
    const row = rows[0];
    return row ? { id: row.id, userId: row.user_id } : null;
  }
}

function mapUser(
  row: BaseRow & { email: string; public_key: string; locale?: string | null },
): UserRecord {
  return {
    id: row.id,
    email: row.email,
    publicKey: row.public_key,
    locale: row.locale ?? null,
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
  approved_by: string | null;
  approved_at: string | Date | null;
  rejected_at: string | Date | null;
  rejection_reason: string | null;
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
    approvedBy: row.approved_by,
    approvedAt: toIsoString(row.approved_at),
    rejectedAt: toIsoString(row.rejected_at),
    rejectionReason: row.rejection_reason,
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
  payload_schema_version?: number;
  idempotency_key?: string | null;
  client_created_at?: string | null;
  version: number;
  created_at: string;
}): EventRecord {
  return {
    id: row.id,
    vaultId: row.vault_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    encryptedPayload: Uint8Array.from(row.encrypted_payload),
    payloadSchemaVersion: row.payload_schema_version ?? 2,
    idempotencyKey: row.idempotency_key ?? null,
    clientCreatedAt: row.client_created_at ?? null,
    version: row.version,
    createdAt: row.created_at,
  };
}
