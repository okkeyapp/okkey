import type { QueryExecutor } from "../storage/postgres.ts";

export type PreprodMigrationMode = "dry-run" | "apply";

export interface PreprodMigrationSnapshot {
  totalVaults: number;
  totalEvents: number;
  legacyEvents: number;
  legacyVaults: number;
}

export interface PreprodMigrationReport {
  mode: PreprodMigrationMode;
  before: PreprodMigrationSnapshot;
  migratedEvents: number;
  migratedVaults: number;
  after: PreprodMigrationSnapshot;
}

export interface PreprodMigrationAdapter {
  getSnapshot(): Promise<PreprodMigrationSnapshot>;
  migrateLegacyEventsToV2(): Promise<number>;
  reconcileVaultCryptoFloorToV2(): Promise<number>;
}

export interface PreprodMigrationGuardInput {
  nodeEnv: string;
  deployEnv: string;
  allowProdOverride: boolean;
}

export class PreprodMigrationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface PreprodMigrationCliOptions {
  mode: PreprodMigrationMode;
  confirmPreprod: boolean;
}

export function parsePreprodMigrationCliArgs(args: string[]): PreprodMigrationCliOptions {
  let mode: PreprodMigrationMode = "dry-run";
  let confirmPreprod = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      if (mode === "apply") {
        throw new PreprodMigrationError(
          "PREPROD_MIGRATION_BAD_ARGS",
          "cannot use --dry-run together with --apply",
        );
      }
      mode = "dry-run";
      continue;
    }
    if (arg === "--apply") {
      if (mode === "dry-run" && args.includes("--dry-run")) {
        throw new PreprodMigrationError(
          "PREPROD_MIGRATION_BAD_ARGS",
          "cannot use --apply together with --dry-run",
        );
      }
      mode = "apply";
      continue;
    }
    if (arg === "--confirm-preprod") {
      confirmPreprod = true;
      continue;
    }
    throw new PreprodMigrationError(
      "PREPROD_MIGRATION_BAD_ARGS",
      `unknown argument: ${arg}`,
    );
  }

  if (mode === "apply" && !confirmPreprod) {
    throw new PreprodMigrationError(
      "PREPROD_MIGRATION_CONFIRM_REQUIRED",
      "apply mode requires --confirm-preprod",
    );
  }

  return {
    mode,
    confirmPreprod,
  };
}

function normalizeEnvValue(value: string): string {
  return value.trim().toLowerCase();
}

export function assertPreprodMigrationEnvironmentAllowed(
  input: PreprodMigrationGuardInput,
): void {
  const deployEnv = normalizeEnvValue(input.deployEnv);
  const nodeEnv = normalizeEnvValue(input.nodeEnv);
  if (input.allowProdOverride) {
    return;
  }
  if (deployEnv === "prod" || nodeEnv === "production") {
    throw new PreprodMigrationError(
      "PREPROD_MIGRATION_PROD_FORBIDDEN",
      "pre-prod migration tooling is forbidden in production environment",
    );
  }
}

export async function runPreprodMigration(
  adapter: PreprodMigrationAdapter,
  options: Pick<PreprodMigrationCliOptions, "mode">,
): Promise<PreprodMigrationReport> {
  const before = await adapter.getSnapshot();
  let migratedEvents = 0;
  let migratedVaults = 0;

  if (options.mode === "apply") {
    migratedEvents = await adapter.migrateLegacyEventsToV2();
    migratedVaults = await adapter.reconcileVaultCryptoFloorToV2();
  }

  const after = await adapter.getSnapshot();
  return {
    mode: options.mode,
    before,
    migratedEvents,
    migratedVaults,
    after,
  };
}

function parseCount(rows: ReadonlyArray<{ count: number | string }>): number {
  const raw = rows[0]?.count;
  const value = typeof raw === "string" ? Number(raw) : raw ?? 0;
  return Number.isFinite(value) ? value : 0;
}

export class PostgresPreprodMigrationAdapter implements PreprodMigrationAdapter {
  private readonly db: QueryExecutor & {
    transaction?<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };

  constructor(
    db: QueryExecutor & {
      transaction?<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
    },
  ) {
    this.db = db;
  }

  async getSnapshot(): Promise<PreprodMigrationSnapshot> {
    const [totalVaultsRows, totalEventsRows, legacyEventsRows, legacyVaultRows] =
      await Promise.all([
        this.db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM vaults"),
        this.db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM events"),
        this.db.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM events WHERE payload_schema_version < 2",
        ),
        this.db.query<{ count: string }>(
          `
            WITH event_max AS (
              SELECT vault_id, MAX(payload_schema_version) AS max_version
              FROM events
              GROUP BY vault_id
            )
            SELECT COUNT(*)::text AS count
            FROM vaults v
            LEFT JOIN event_max em ON em.vault_id = v.id
            WHERE v.crypto_version < GREATEST(2, COALESCE(em.max_version, 2))
          `,
        ),
      ]);

    return {
      totalVaults: parseCount(totalVaultsRows),
      totalEvents: parseCount(totalEventsRows),
      legacyEvents: parseCount(legacyEventsRows),
      legacyVaults: parseCount(legacyVaultRows),
    };
  }

  async migrateLegacyEventsToV2(): Promise<number> {
    return this.withTransaction(async (tx) => {
      const rows = await tx.query<{ count: string }>(
        `
          WITH updated AS (
            UPDATE events
            SET payload_schema_version = 2
            WHERE payload_schema_version < 2
            RETURNING id
          )
          SELECT COUNT(*)::text AS count FROM updated
        `,
      );
      return parseCount(rows);
    });
  }

  async reconcileVaultCryptoFloorToV2(): Promise<number> {
    return this.withTransaction(async (tx) => {
      const rows = await tx.query<{ count: string }>(
        `
          WITH event_max AS (
            SELECT vault_id, MAX(payload_schema_version) AS max_version
            FROM events
            GROUP BY vault_id
          ),
          updated AS (
            UPDATE vaults v
            SET crypto_version = GREATEST(2, COALESCE(em.max_version, 2)),
                updated_at = NOW()
            FROM event_max em
            WHERE em.vault_id = v.id
              AND v.crypto_version < GREATEST(2, COALESCE(em.max_version, 2))
            RETURNING v.id
          ),
          updated_without_events AS (
            UPDATE vaults v
            SET crypto_version = 2,
                updated_at = NOW()
            WHERE NOT EXISTS (
              SELECT 1 FROM events e WHERE e.vault_id = v.id
            )
              AND v.crypto_version < 2
            RETURNING v.id
          )
          SELECT (
            (SELECT COUNT(*) FROM updated) +
            (SELECT COUNT(*) FROM updated_without_events)
          )::text AS count
        `,
      );
      return parseCount(rows);
    });
  }

  private async withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    if (typeof this.db.transaction === "function") {
      return this.db.transaction(fn);
    }
    return fn(this.db);
  }
}
