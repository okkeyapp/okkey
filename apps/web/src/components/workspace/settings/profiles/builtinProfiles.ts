import {
  hasPlanFeature,
  type WorkspaceBuiltInProfileId,
  type WorkspaceBuiltInProfileDto,
  type WorkspaceProfileSummary,
} from "@okkey/types";

export type BuiltInProfileDefinition = {
  builtinId: WorkspaceBuiltInProfileId;
  descriptionKey: string;
};

export const BUILT_IN_PROFILE_DEFINITIONS: readonly BuiltInProfileDefinition[] = [
  {
    builtinId: "extended",
    descriptionKey: "web.workspaceSettings.profiles.builtIn.extendedDescription",
  },
  {
    builtinId: "simple",
    descriptionKey: "web.workspaceSettings.profiles.builtIn.simpleDescription",
  },
] as const;

export function buildBuiltInProfileSummaries(
  t: (key: string) => string,
  applicationCounts?: Partial<Record<WorkspaceBuiltInProfileId, number>>,
): WorkspaceProfileSummary[] {
  return BUILT_IN_PROFILE_DEFINITIONS.map((def) => ({
    id: def.builtinId,
    builtinId: def.builtinId,
    kind: "builtin" as const,
    name: t(`web.workspaceSettings.profiles.builtIn.${def.builtinId}`),
    description: t(def.descriptionKey),
    applicationCount: applicationCounts?.[def.builtinId] ?? 0,
  }));
}

/** Custom profiles require the ENTERPRISE plan feature (module presence is checked separately). */
export function canManageCustomWorkspaceProfiles(planTier: string | undefined): boolean {
  return hasPlanFeature(planTier, "customWorkspaceProfiles");
}

export function extractBuiltInApplicationCounts(
  profiles: WorkspaceBuiltInProfileDto[],
): Partial<Record<WorkspaceBuiltInProfileId, number>> {
  const counts: Partial<Record<WorkspaceBuiltInProfileId, number>> = {};
  for (const profile of profiles) {
    if (profile.kind === "builtin" && profile.builtin_id) {
      counts[profile.builtin_id] = Number(profile.application_count) || 0;
    }
  }
  return counts;
}
