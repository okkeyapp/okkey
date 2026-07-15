import { generateEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "../storage/postgres.ts";

const PERMISSION_RESOURCES = [
  "settings",
  "roles",
  "profiles",
  "members",
  "vaults",
  "billing",
] as const;

type ResourcePermission = {
  get: 0 | 1 | 2;
  post: 0 | 1;
  put: 0 | 1 | 2;
  delete: 0 | 1 | 2;
};

function buildPermissionsMatrix(value: 0 | 1): Record<(typeof PERMISSION_RESOURCES)[number], ResourcePermission> {
  const cell: ResourcePermission = {
    get: value,
    post: value,
    put: value,
    delete: value,
  };
  return {
    settings: { ...cell },
    roles: { ...cell },
    profiles: { ...cell },
    members: { ...cell },
    vaults: { ...cell },
    billing: { ...cell },
  };
}

/** Owner/Admin: full access (1). User: no access (0). */
const BUILTIN_ROLE_PERMISSIONS = {
  owner: buildPermissionsMatrix(1),
  admin: buildPermissionsMatrix(1),
  user: buildPermissionsMatrix(0),
} as const;

const DEFAULT_SYSTEM_ROLES = [
  { builtinKey: "owner", name: "Owner" },
  { builtinKey: "admin", name: "Admin" },
  { builtinKey: "user", name: "User" },
] as const;

export async function ensureDefaultWorkspaceRoles(
  tx: QueryExecutor,
  workspaceId: string,
  ownerId: string,
): Promise<{ ownerRoleId: string }> {
  let ownerRoleId: string | null = null;

  for (const role of DEFAULT_SYSTEM_ROLES) {
    const permissionsJson = JSON.stringify(BUILTIN_ROLE_PERMISSIONS[role.builtinKey]);
    const existingRows = await tx.query<{ id: string }>(
      `
        SELECT id
        FROM roles
        WHERE workspace_id = $1
          AND builtin_key = $2
        LIMIT 1
      `,
      [workspaceId, role.builtinKey],
    );
    const existingId = existingRows[0]?.id;
    if (existingId) {
      await tx.query(
        `
          UPDATE roles
          SET permissions_json = $3::jsonb,
              updated_at = now()
          WHERE id = $1
            AND workspace_id = $2
        `,
        [existingId, workspaceId, permissionsJson],
      );
      if (role.builtinKey === "owner") {
        ownerRoleId = existingId;
      }
      continue;
    }

    const roleId = generateEntityId();
    const insertedRows = await tx.query<{ id: string }>(
      `
        INSERT INTO roles (id, workspace_id, name, description, permissions_json, is_system, builtin_key)
        VALUES ($1, $2, $3, '', $4::jsonb, true, $5)
        RETURNING id
      `,
      [roleId, workspaceId, role.name, permissionsJson, role.builtinKey],
    );
    const insertedId = insertedRows[0]?.id;
    if (!insertedId) {
      throw new Error(`failed to seed ${role.builtinKey} role`);
    }
    if (role.builtinKey === "owner") {
      ownerRoleId = insertedId;
    }
  }

  if (!ownerRoleId) {
    throw new Error("owner role was not seeded");
  }

  const existingMemberRows = await tx.query<{ id: string }>(
    `
      SELECT id
      FROM workspace_members
      WHERE workspace_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [workspaceId, ownerId],
  );

  if (existingMemberRows[0]) {
    await tx.query(
      `
        UPDATE workspace_members
        SET role_id = $3
        WHERE workspace_id = $1
          AND user_id = $2
          AND role_id IS NULL
      `,
      [workspaceId, ownerId, ownerRoleId],
    );
    return { ownerRoleId };
  }

  const memberId = generateEntityId();
  await tx.query(
    `
      INSERT INTO workspace_members (id, workspace_id, user_id, role_id)
      VALUES ($1, $2, $3, $4)
    `,
    [memberId, workspaceId, ownerId, ownerRoleId],
  );

  return { ownerRoleId };
}
