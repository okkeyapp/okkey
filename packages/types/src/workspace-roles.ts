export type WorkspaceBuiltInRoleId = "owner" | "admin" | "user";

export interface WorkspaceRoleSummary {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "custom";
  builtinId?: WorkspaceBuiltInRoleId;
  memberCount: number;
}

/** `GET /workspaces/:workspaceId/roles` built-in role item (open-core). */
export interface WorkspaceBuiltInRoleDto {
  id: string;
  kind: "builtin";
  builtin_id: WorkspaceBuiltInRoleId;
  name: string;
  description: string;
  member_count: number;
}

/**
 * `GET /workspaces/:workspaceId/roles` custom role item (open-core).
 * Custom roles created while enterprise modules were enabled stay listed (and deletable) after downgrade.
 */
export interface WorkspaceCustomRoleRemnantDto {
  id: string;
  kind: "custom";
  /** Lets callers read `builtin_id` on the list union without narrowing first. */
  builtin_id?: undefined;
  name: string;
  description: string;
  member_count: number;
  created_by: string | null;
}

export type WorkspaceRoleListItemDto = WorkspaceBuiltInRoleDto | WorkspaceCustomRoleRemnantDto;

/** `GET /workspaces/:workspaceId/roles` success body (built-in only). */
export interface WorkspaceBuiltInRolesListResponseDto {
  roles: WorkspaceBuiltInRoleDto[];
}

/** `GET /workspaces/:workspaceId/roles` success body (open-core: built-in + custom remnants). */
export interface WorkspaceRolesListResponseDto {
  roles: WorkspaceRoleListItemDto[];
}
