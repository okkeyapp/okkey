import type {
  ApprovalStatusDevice,
  ApprovalStatusTokenRecord,
  DeviceApprovalStatusStore,
} from "../device/approval-status.ts";
import type { QueryExecutor } from "./postgres.ts";

type DeviceRow = {
  id: string;
  user_id: string;
  status: ApprovalStatusDevice["status"];
  created_at: string | Date;
  blocked_until: string | Date | null;
  device_name: string;
  device_fingerprint: string;
  platform: string;
  os_name: string;
  os_version: string;
  app_version: string;
  client_type: string;
  user_agent: string;
};

const DEVICE_COLUMNS = `
  id::text AS id,
  user_id::text AS user_id,
  status,
  created_at,
  blocked_until,
  device_name,
  device_fingerprint,
  platform,
  os_name,
  os_version,
  app_version,
  client_type,
  user_agent
`;

function toIso(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function mapDevice(row: DeviceRow): ApprovalStatusDevice {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    blockedUntil: toIso(row.blocked_until),
    deviceName: row.device_name,
    deviceFingerprint: row.device_fingerprint,
    platform: row.platform,
    osName: row.os_name,
    osVersion: row.os_version,
    appVersion: row.app_version,
    clientType: row.client_type,
    userAgent: row.user_agent,
  };
}

export class PostgresDeviceApprovalStatusStore implements DeviceApprovalStatusStore {
  constructor(private readonly db: QueryExecutor) {}

  async replaceToken(input: {
    tokenHash: string;
    userId: string;
    deviceId: string;
    requestCreatedAt: string;
    expiresAt: string;
  }): Promise<void> {
    await this.db.query(
      `
        WITH removed AS (
          DELETE FROM device_approval_status_tokens
          WHERE user_id = $1::bigint AND device_id = $2::bigint
        )
        INSERT INTO device_approval_status_tokens (
          token_hash,
          user_id,
          device_id,
          request_created_at,
          expires_at
        )
        VALUES ($3, $1::bigint, $2::bigint, $4::timestamptz, $5::timestamptz)
      `,
      [input.userId, input.deviceId, input.tokenHash, input.requestCreatedAt, input.expiresAt],
    );
  }

  async findToken(tokenHash: string, nowIso: string): Promise<ApprovalStatusTokenRecord | null> {
    const rows = await this.db.query<{
      user_id: string;
      device_id: string;
      request_created_at: string | Date;
      expires_at: string | Date;
    }>(
      `
        SELECT
          user_id::text AS user_id,
          device_id::text AS device_id,
          request_created_at,
          expires_at
        FROM device_approval_status_tokens
        WHERE token_hash = $1
          AND expires_at > $2::timestamptz
      `,
      [tokenHash, nowIso],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      deviceId: row.device_id,
      requestCreatedAt: toIso(row.request_created_at) ?? nowIso,
      expiresAt: toIso(row.expires_at) ?? nowIso,
    };
  }

  async findDevice(userId: string, deviceId: string): Promise<ApprovalStatusDevice | null> {
    const rows = await this.db.query<DeviceRow>(
      `
        SELECT ${DEVICE_COLUMNS}
        FROM devices
        WHERE id = $1::bigint AND user_id = $2::bigint
      `,
      [deviceId, userId],
    );
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async reopenRejected(
    userId: string,
    deviceId: string,
    nowIso: string,
  ): Promise<ApprovalStatusDevice | null> {
    const rows = await this.db.query<DeviceRow>(
      `
        UPDATE devices
        SET
          status = 'pending',
          created_at = $3::timestamptz,
          last_seen_at = $3::timestamptz,
          rejected_at = NULL,
          rejection_reason = NULL,
          revoked_at = NULL
        WHERE id = $1::bigint
          AND user_id = $2::bigint
          AND status = 'revoked'
        RETURNING ${DEVICE_COLUMNS}
      `,
      [deviceId, userId, nowIso],
    );
    return rows[0] ? mapDevice(rows[0]) : null;
  }
}
