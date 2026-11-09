import type { QueryExecutor } from "../storage/postgres.ts";
import type { UpdateComponent } from "./package-format.ts";

export type DismissalStore = {
  read(): Promise<Partial<Record<UpdateComponent, string>>>;
  dismiss(component: UpdateComponent, version: string): Promise<void>;
};

export function memoryDismissalStore(): DismissalStore {
  const values = new Map<UpdateComponent, string>();
  return {
    async read() {
      return Object.fromEntries(values) as Partial<Record<UpdateComponent, string>>;
    },
    async dismiss(component, version) {
      values.set(component, version);
    },
  };
}

export function postgresDismissalStore(db: QueryExecutor): DismissalStore {
  return {
    async read() {
      const rows = await db.query<{ component: string; dismissed_version: string }>(
        "SELECT component, dismissed_version FROM system_update_dismissals",
      );
      const result: Partial<Record<UpdateComponent, string>> = {};
      for (const row of rows) {
        if (row.component === "okkey" || row.component === "enterprise") {
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
  };
}
