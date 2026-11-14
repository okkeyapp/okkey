import type { QueryExecutor } from "../storage/postgres.ts";
import type { UpdateComponent } from "./package-format.ts";
import { compareVersions } from "./versions.ts";

export type DismissalStore = {
  read(): Promise<Partial<Record<UpdateComponent, string>>>;
  dismiss(component: UpdateComponent, version: string): Promise<void>;
  readSeen(): Promise<Partial<Record<UpdateComponent, string>>>;
  markSeen(component: UpdateComponent, version: string): Promise<void>;
};

export function memoryDismissalStore(): DismissalStore {
  const values = new Map<UpdateComponent, string>();
  const seen = new Map<UpdateComponent, string>();
  return {
    async read() {
      return Object.fromEntries(values) as Partial<Record<UpdateComponent, string>>;
    },
    async dismiss(component, version) {
      values.set(component, version);
    },
    async readSeen() {
      return Object.fromEntries(seen) as Partial<Record<UpdateComponent, string>>;
    },
    async markSeen(component, version) {
      const previous = seen.get(component);
      if (previous && compareVersions(version, previous) <= 0) {
        return;
      }
      seen.set(component, version);
    },
  };
}

export function postgresDismissalStore(db: QueryExecutor): DismissalStore {
  return {
    async read() {
      const rows = await db.query<{ component: string; dismissed_version: string | null }>(
        "SELECT component, dismissed_version FROM system_update_dismissals",
      );
      const result: Partial<Record<UpdateComponent, string>> = {};
      for (const row of rows) {
        if ((row.component === "okkey" || row.component === "enterprise") && row.dismissed_version) {
          result[row.component] = row.dismissed_version;
        }
      }
      return result;
    },
    async dismiss(component, version) {
      await db.query(
        `
          INSERT INTO system_update_dismissals (component, dismissed_version)
          VALUES ($1, $2)
          ON CONFLICT (component) DO UPDATE
          SET dismissed_version = EXCLUDED.dismissed_version,
              dismissed_at = now()
        `,
        [component, version],
      );
    },
    async readSeen() {
      const rows = await db.query<{ component: string; seen_version: string | null }>(
        "SELECT component, seen_version FROM system_update_dismissals",
      );
      const result: Partial<Record<UpdateComponent, string>> = {};
      for (const row of rows) {
        if ((row.component === "okkey" || row.component === "enterprise") && row.seen_version) {
          result[row.component] = row.seen_version;
        }
      }
      return result;
    },
    async markSeen(component, version) {
      const currentRows = await db.query<{ component: string; seen_version: string | null }>(
        "SELECT component, seen_version FROM system_update_dismissals WHERE component = $1",
        [component],
      );
      const previous = currentRows[0]?.seen_version ?? undefined;
      if (previous && compareVersions(version, previous) <= 0) {
        return;
      }
      await db.query(
        `
          INSERT INTO system_update_dismissals (component, dismissed_version, seen_version)
          VALUES ($1, NULL, $2)
          ON CONFLICT (component) DO UPDATE
          SET seen_version = EXCLUDED.seen_version
        `,
        [component, version],
      );
    },
  };
}
