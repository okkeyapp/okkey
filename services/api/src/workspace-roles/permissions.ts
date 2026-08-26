import type { QueryExecutor } from "../storage/postgres.ts";

export const WORKSPACE_PERMISSION_RESOURCES = [
  "settings",
  "settings_items",
  "settings_capsules",
  "roles",
  "profiles",
  "members",
  "vaults",
  "billing",
] as const;

export type WorkspacePermissionResource = (typeof WORKSPACE_PERMISSION_RESOURCES)[number];

export type WorkspacePermissionAction = "get" | "post" | "put" | "delete";

export type WorkspaceResourcePermission = {
  get: 0 | 1 | 2;
  post: 0 | 1;
  put: 0 | 1 | 2;
  delete: 0 | 1 | 2;
};

export type WorkspacePermissionsMatrix = Record<
  WorkspacePermissionResource,
  WorkspaceResourcePermission
>;

export class WorkspacePermissionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const FULL_CELL: WorkspaceResourcePermission = { get: 1, post: 1, put: 1, delete: 1 };
const EMPTY_CELL: WorkspaceResourcePermission = { get: 0, post: 0, put: 0, delete: 0 };

/** Nested settings pages use GET/PUT checkboxes only. */
function checkboxCellFromSettings(settings: WorkspaceResourcePermission): WorkspaceResourcePermission {
  return {
    get: settings.get >= 1 ? 1 : 0,
    post: 0,
    put: settings.put >= 1 ? 1 : 0,
    delete: 0,
  };
}

export function fullPermissionsMatrix(): WorkspacePermissionsMatrix {
  return {
    settings: { ...FULL_CELL },
    settings_items: { ...FULL_CELL, post: 0, delete: 0 },
    settings_capsules: { ...FULL_CELL, post: 0, delete: 0 },
    roles: { ...FULL_CELL },
    profiles: { ...FULL_CELL },
    members: { ...FULL_CELL },
    vaults: { ...FULL_CELL },
    billing: { ...FULL_CELL },
  };
}

export function emptyPermissionsMatrix(): WorkspacePermissionsMatrix {
  return {
    settings: { ...EMPTY_CELL },
    settings_items: { ...EMPTY_CELL },
    settings_capsules: { ...EMPTY_CELL },
    roles: { ...EMPTY_CELL },
    profiles: { ...EMPTY_CELL },
    members: { ...EMPTY_CELL },
    vaults: { ...EMPTY_CELL },
    billing: { ...EMPTY_CELL },
  };
}

function asLevel01(value: unknown): 0 | 1 {
  return value === 1 || value === "1" ? 1 : 0;
}

function asLevel012(value: unknown): 0 | 1 | 2 {
  if (value === 2 || value === "2") {
    return 2;
  }
  if (value === 1 || value === "1") {
    return 1;
  }
  return 0;
}

export function parsePermissionsMatrix(raw: unknown): WorkspacePermissionsMatrix {
  const base = emptyPermissionsMatrix();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const record = raw as Record<string, unknown>;
  for (const resource of WORKSPACE_PERMISSION_RESOURCES) {
    const cell = record[resource];
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      continue;
    }
    const c = cell as Record<string, unknown>;
    base[resource] = {
      get: asLevel012(c.get),
      post: asLevel01(c.post),
      put: asLevel012(c.put),
      delete: asLevel012(c.delete),
    };
  }
  // Legacy roles without nested settings resources inherit from `settings`.
  if (!("settings_items" in record)) {
    base.settings_items = checkboxCellFromSettings(base.settings);
  }
  if (!("settings_capsules" in record)) {
    base.settings_capsules = checkboxCellFromSettings(base.settings);
  }
  return base;
}

/** True when the actor may read the resource (all or own). */
export function permissionAllowsGet(level: 0 | 1 | 2): boolean {
  return level >= 1;
}

/** True when the actor may create. */
export function permissionAllowsPost(level: 0 | 1): boolean {
  return level >= 1;
}

/** True when scope is full access (not own-only). */
export function permissionAllowsAll(level: 0 | 1 | 2): boolean {
  return level === 1;
}

/** True when the actor may mutate at least own objects (all or own). */
export function permissionAllowsMutate(level: 0 | 1 | 2): boolean {
  return level >= 1;
}

/**
 * Whether a specific object may be accessed under a get/put/delete level.
 * `level === 1` → any object; `level === 2` → only when `isOwn`; `0` → never.
 */
export function permissionAllowsObject(level: 0 | 1 | 2, isOwn: boolean): boolean {
  if (level === 1) {
    return true;
  }
  if (level === 2) {
    return isOwn;
  }
  return false;
}

/**
 * Resolve the actor's workspace role permissions matrix.
 * Workspace owner always gets full access (even without a members row).
 */
export async function resolveWorkspacePermissions(
  db: QueryExecutor,
  workspaceId: string,
  userId: string,
): Promise<WorkspacePermissionsMatrix> {
  const ownerRows = await db.query<{ owner_id: string }>(
    `SELECT owner_id FROM workspaces WHERE id = $1 LIMIT 1`,
    [workspaceId],
  );
  const ownerId = ownerRows[0]?.owner_id;
  if (!ownerId) {
    throw new WorkspacePermissionError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
  }
  if (ownerId === userId) {
    return fullPermissionsMatrix();
  }

  const rows = await db.query<{ permissions_json: unknown }>(
    `
      SELECT r.permissions_json
      FROM workspace_members wm
      JOIN roles r ON r.id = wm.role_id
      WHERE wm.workspace_id = $1
        AND wm.user_id = $2
      LIMIT 1
    `,
    [workspaceId, userId],
  );
  const raw = rows[0]?.permissions_json;
  if (raw === undefined) {
    throw new WorkspacePermissionError("ACCESS_DENIED", 403, "access denied");
  }
  return parsePermissionsMatrix(raw);
}

/**
 * Assert the actor has at least level 1 for the action (create or any scope including own).
 * Does not check object ownership — use {@link assertWorkspacePermissionOnObject} for that.
 */
export async function assertWorkspacePermission(
  db: QueryExecutor,
  workspaceId: string,
  userId: string,
  resource: WorkspacePermissionResource,
  action: WorkspacePermissionAction,
): Promise<WorkspacePermissionsMatrix> {
  const matrix = await resolveWorkspacePermissions(db, workspaceId, userId);
  const level = matrix[resource][action];
  if (level < 1) {
    throw new WorkspacePermissionError("ACCESS_DENIED", 403, "access denied");
  }
  return matrix;
}

/**
 * Assert get/put/delete on a concrete object, honoring own-only (`level === 2`).
 */
export async function assertWorkspacePermissionOnObject(
  db: QueryExecutor,
  workspaceId: string,
  userId: string,
  resource: WorkspacePermissionResource,
  action: Exclude<WorkspacePermissionAction, "post">,
  isOwn: boolean,
): Promise<WorkspacePermissionsMatrix> {
  const matrix = await resolveWorkspacePermissions(db, workspaceId, userId);
  const level = matrix[resource][action];
  if (!permissionAllowsObject(level, isOwn)) {
    throw new WorkspacePermissionError("ACCESS_DENIED", 403, "access denied");
  }
  return matrix;
}
