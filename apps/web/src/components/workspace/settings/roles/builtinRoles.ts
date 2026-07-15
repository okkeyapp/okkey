import type { WorkspaceBuiltInRoleId, WorkspaceBuiltInRoleDto, WorkspaceRoleSummary } from "@okkey/types";

export type BuiltInRoleDefinition = {
  builtinId: WorkspaceBuiltInRoleId;
  descriptionKey: string;
  /** Mock member count until roles API exists. */
  defaultMemberCount: number;
};

export const BUILT_IN_ROLE_DEFINITIONS: readonly BuiltInRoleDefinition[] = [
  {
    builtinId: "owner",
    descriptionKey: "web.workspaceSettings.roles.builtIn.ownerDescription",
    defaultMemberCount: 1,
  },
  {
    builtinId: "admin",
    descriptionKey: "web.workspaceSettings.roles.builtIn.adminDescription",
    defaultMemberCount: 0,
  },
  {
    builtinId: "user",
    descriptionKey: "web.workspaceSettings.roles.builtIn.userDescription",
    defaultMemberCount: 0,
  },
] as const;

export function buildBuiltInRoleSummaries(
  t: (key: string) => string,
  memberCounts?: Partial<Record<WorkspaceBuiltInRoleId, number>>,
): WorkspaceRoleSummary[] {
  return BUILT_IN_ROLE_DEFINITIONS.map((def) => ({
    id: def.builtinId,
    builtinId: def.builtinId,
    kind: "builtin" as const,
    name: t(`web.workspaceSettings.roles.builtIn.${def.builtinId}`),
    description: t(def.descriptionKey),
    memberCount: memberCounts?.[def.builtinId] ?? def.defaultMemberCount,
  }));
}

export function canManageCustomWorkspaceRoles(planTier: string | undefined): boolean {
  if (import.meta.env.VITE_ENTERPRISE_MODULES === "true") {
    return true;
  }
  return Boolean(planTier && planTier !== "FREE");
}

export function extractBuiltInMemberCounts(
  roles: WorkspaceBuiltInRoleDto[],
): Partial<Record<WorkspaceBuiltInRoleId, number>> {
  const counts: Partial<Record<WorkspaceBuiltInRoleId, number>> = {};
  for (const role of roles) {
    if (role.kind === "builtin" && role.builtin_id) {
      counts[role.builtin_id] = role.member_count;
    }
  }
  return counts;
}
