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

/** `GET /workspaces/:workspaceId/roles` success body (open-core). */
export interface WorkspaceBuiltInRolesListResponseDto {
  roles: WorkspaceBuiltInRoleDto[];
}
