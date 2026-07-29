import { generateEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import {
  createFullAccessProfilePermissions,
  createSimpleProfilePermissions,
} from "../../../../packages/types/src/workspace-profiles.ts";

const DEFAULT_SYSTEM_PROFILES = [
  {
    builtinKey: "extended" as const,
    name: "Extended",
    permissions: createFullAccessProfilePermissions(),
  },
  {
    builtinKey: "simple" as const,
    name: "Simple",
    permissions: createSimpleProfilePermissions(),
  },
] as const;

export async function ensureDefaultWorkspaceProfiles(
  tx: QueryExecutor,
  workspaceId: string,
): Promise<void> {
  for (const profile of DEFAULT_SYSTEM_PROFILES) {
    const permissionsJson = JSON.stringify(profile.permissions);
    const existingRows = await tx.query<{ id: string }>(
      `
        SELECT id
        FROM profiles
        WHERE workspace_id = $1
          AND builtin_key = $2
        LIMIT 1
      `,
      [workspaceId, profile.builtinKey],
    );
    const existingId = existingRows[0]?.id;
    if (existingId) {
      await tx.query(
        `
          UPDATE profiles
          SET permissions_json = $3::jsonb,
              updated_at = now()
          WHERE id = $1
            AND workspace_id = $2
        `,
        [existingId, workspaceId, permissionsJson],
      );
      continue;
    }

    const profileId = generateEntityId();
    const insertedRows = await tx.query<{ id: string }>(
      `
        INSERT INTO profiles (id, workspace_id, name, description, permissions_json, is_system, builtin_key)
        VALUES ($1, $2, $3, '', $4::jsonb, true, $5)
        RETURNING id
      `,
      [profileId, workspaceId, profile.name, permissionsJson, profile.builtinKey],
    );
    if (!insertedRows[0]?.id) {
      throw new Error(`failed to seed ${profile.builtinKey} profile`);
    }
  }
}
