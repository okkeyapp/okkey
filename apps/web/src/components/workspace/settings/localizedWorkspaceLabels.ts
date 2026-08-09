/** Localized labels for built-in workspace roles and profiles. */

export function localizedRoleLabel(
  role: { builtinId?: string | null; name: string },
  t: (key: string) => string,
): string {
  if (role.builtinId === "owner" || role.builtinId === "admin" || role.builtinId === "user") {
    return t(`web.workspaceSettings.roles.builtIn.${role.builtinId}`);
  }
  return role.name;
}

export function localizedProfileLabel(
  profile: { builtinId?: string | null; name: string },
  t: (key: string) => string,
): string {
  if (profile.builtinId === "extended" || profile.builtinId === "simple") {
    return t(`web.workspaceSettings.profiles.builtIn.${profile.builtinId}`);
  }
  return profile.name;
}

/** Right-edge align for profile ghost selects in vault/member access rows. */
export const GHOST_SELECT_PROFILE_ALIGN_CLASS = "-me-[7px]";

/** Left-edge align for role ghost select in member info table. */
export const GHOST_SELECT_ROLE_ALIGN_CLASS = "-ms-3";
