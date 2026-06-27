import { generateEntityId } from "../entity-id.ts";
import { EntityNotFoundError, VersionConflictError } from "./errors.ts";
import type { QueryExecutor } from "./postgres.ts";

export interface WorkspacePersonalEventRecord {
  id: string;
  workspaceId: string;
  userId: string;
  eventType: string;
  encryptedPayload: Uint8Array;
  payloadSchemaVersion: number;
  idempotencyKey: string | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}

type EventRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  event_type: string;
  encrypted_payload: Buffer;
  payload_schema_version: number;
  idempotency_key: string | null;
  client_created_at: string | null;
  version: number;
  created_at: string;
};

function mapEvent(row: EventRow): WorkspacePersonalEventRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    eventType: row.event_type,
    encryptedPayload: new Uint8Array(row.encrypted_payload),
    payloadSchemaVersion: row.payload_schema_version,
    idempotencyKey: row.idempotency_key,
    clientCreatedAt: row.client_created_at,
    version: row.version,
    createdAt: row.created_at,
  };
}

export class WorkspacePersonalEventsRepository {
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

  async listAfterVersion(
    workspaceId: string,
    userId: string,
    afterVersion: number,
  ): Promise<WorkspacePersonalEventRecord[]> {
    const rows = await this.db.query<EventRow>(
      `
        SELECT id, workspace_id, user_id, event_type, encrypted_payload,
               payload_schema_version, idempotency_key, client_created_at, version, created_at
        FROM workspace_personal_events
        WHERE workspace_id = $1 AND user_id = $2 AND version > $3
        ORDER BY version ASC
      `,
      [workspaceId, userId, afterVersion],
    );
    return rows.map(mapEvent);
  }

  async append(input: {
    workspaceId: string;
    userId: string;
    eventType: string;
    encryptedPayload: Uint8Array;
    baseVersion: number;
    payloadSchemaVersion?: number;
    idempotencyKey?: string | null;
    clientCreatedAt?: string | null;
  }): Promise<WorkspacePersonalEventRecord> {
    return this.db.transaction(async (tx) => {
      const workspaceRows = await tx.query<{ id: string }>(
        "SELECT id FROM workspaces WHERE id = $1 FOR UPDATE",
        [input.workspaceId],
      );
      if (!workspaceRows[0]) {
        throw new EntityNotFoundError("workspace", input.workspaceId);
      }

      if (input.idempotencyKey) {
        const existingRows = await tx.query<EventRow>(
          `
            SELECT id, workspace_id, user_id, event_type, encrypted_payload,
                   payload_schema_version, idempotency_key, client_created_at, version, created_at
            FROM workspace_personal_events
            WHERE workspace_id = $1 AND user_id = $2 AND idempotency_key = $3::bigint
            FOR UPDATE
          `,
          [input.workspaceId, input.userId, input.idempotencyKey],
        );
        if (existingRows[0]) {
          return mapEvent(existingRows[0]);
        }
      }

      const versionRows = await tx.query<{ current_version: number }>(
        `
          SELECT COALESCE(MAX(version), 0) AS current_version
          FROM workspace_personal_events
          WHERE workspace_id = $1 AND user_id = $2
        `,
        [input.workspaceId, input.userId],
      );
      const currentVersion = Number(versionRows[0]?.current_version ?? 0);
      if (input.baseVersion !== currentVersion) {
        throw new VersionConflictError(input.baseVersion, currentVersion);
      }

      const nextVersion = currentVersion + 1;
      const payloadSchemaVersion = input.payloadSchemaVersion ?? 2;
      const eventId = generateEntityId();

      const rows = await tx.query<EventRow>(
        `
          INSERT INTO workspace_personal_events (
            id, workspace_id, user_id, event_type, encrypted_payload, version,
            payload_schema_version, idempotency_key, client_created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, workspace_id, user_id, event_type, encrypted_payload,
                    payload_schema_version, idempotency_key, client_created_at, version, created_at
        `,
        [
          eventId,
          input.workspaceId,
          input.userId,
          input.eventType,
          Buffer.from(input.encryptedPayload),
          nextVersion,
          payloadSchemaVersion,
          input.idempotencyKey ?? null,
          input.clientCreatedAt ?? null,
        ],
      );
      return mapEvent(rows[0]!);
    });
  }
}
