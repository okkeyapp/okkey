import type { WorkspacesRepository } from "../storage/repositories.ts";
import type {
  CapsuleDefaultsType,
  WorkspaceMemberCapsuleDefaultsRepository,
} from "../storage/workspace-member-capsule-defaults.ts";

export type CapsuleSchedulePreset =
  | "never"
  | "now"
  | "15m"
  | "1h"
  | "6h"
  | "12h"
  | "24h";

export type CapsuleAccessDefaults = {
  viewsEnabled: boolean;
  maxViews: number;
  viewLimitAction: "deactivate" | "delete";
  timeEnabled: boolean;
  activatePreset: CapsuleSchedulePreset;
  deactivatePreset: CapsuleSchedulePreset;
  deletePreset: CapsuleSchedulePreset;
  accessEnabled: boolean;
  passwordEnabled: boolean;
  attemptLimit: number;
  approvalRequired: boolean;
};

export type CapsuleDefaultsEntry = {
  type: CapsuleDefaultsType;
  settings: CapsuleAccessDefaults;
};

const CAPSULE_TYPES = new Set<CapsuleDefaultsType>(["text", "file", "item"]);
const SCHEDULE_PRESETS = new Set<CapsuleSchedulePreset>([
  "never",
  "now",
  "15m",
  "1h",
  "6h",
  "12h",
  "24h",
]);

export class CapsuleDefaultsServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface CapsuleDefaultsServiceDeps {
  defaults: WorkspaceMemberCapsuleDefaultsRepository;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
}

export class CapsuleDefaultsService {
  private readonly defaults: CapsuleDefaultsServiceDeps["defaults"];
  private readonly workspaces: CapsuleDefaultsServiceDeps["workspaces"];

  constructor(deps: CapsuleDefaultsServiceDeps) {
    this.defaults = deps.defaults;
    this.workspaces = deps.workspaces;
  }

  async listDefaults(workspaceId: string, userId: string): Promise<CapsuleDefaultsEntry[]> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const rows = await this.defaults.list(workspaceId, userId);
    return rows.map((row) => ({
      type: row.capsuleType,
      settings: normalizeCapsuleAccessDefaults(row.settings),
    }));
  }

  async upsertDefaults(
    workspaceId: string,
    userId: string,
    type: CapsuleDefaultsType,
    settings: CapsuleAccessDefaults,
  ): Promise<CapsuleDefaultsEntry> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const normalized = normalizeCapsuleAccessDefaults(settings);
    const row = await this.defaults.upsert({
      workspaceId,
      userId,
      capsuleType: type,
      settings: normalized,
    });
    return {
      type: row.capsuleType,
      settings: normalizeCapsuleAccessDefaults(row.settings),
    };
  }

  private async assertWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new CapsuleDefaultsServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new CapsuleDefaultsServiceError("FORBIDDEN", 403, "workspace access required");
    }
  }
}

export function parseCapsuleDefaultsType(value: unknown): CapsuleDefaultsType | null {
  if (typeof value !== "string") return null;
  return CAPSULE_TYPES.has(value as CapsuleDefaultsType)
    ? (value as CapsuleDefaultsType)
    : null;
}

export function parseCapsuleAccessDefaultsPayload(
  value: unknown,
): CapsuleAccessDefaults | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return normalizeCapsuleAccessDefaults(value as Record<string, unknown>);
}

export function normalizeCapsuleAccessDefaults(
  value: Record<string, unknown> | CapsuleAccessDefaults,
): CapsuleAccessDefaults {
  const source = value as Record<string, unknown>;
  const maxViewsRaw = source.maxViews;
  const attemptLimitRaw = source.attemptLimit;
  return {
    viewsEnabled: Boolean(source.viewsEnabled),
    maxViews:
      typeof maxViewsRaw === "number" && Number.isFinite(maxViewsRaw)
        ? Math.max(1, Math.floor(maxViewsRaw))
        : 1,
    viewLimitAction: source.viewLimitAction === "delete" ? "delete" : "deactivate",
    timeEnabled: Boolean(source.timeEnabled),
    activatePreset: isSchedulePreset(source.activatePreset) ? source.activatePreset : "now",
    deactivatePreset: isSchedulePreset(source.deactivatePreset)
      ? source.deactivatePreset
      : "never",
    deletePreset: isSchedulePreset(source.deletePreset) ? source.deletePreset : "never",
    accessEnabled: Boolean(source.accessEnabled),
    passwordEnabled: Boolean(source.passwordEnabled),
    attemptLimit:
      typeof attemptLimitRaw === "number" && Number.isFinite(attemptLimitRaw)
        ? Math.max(1, Math.floor(attemptLimitRaw))
        : 3,
    approvalRequired: Boolean(source.approvalRequired),
  };
}

function isSchedulePreset(value: unknown): value is CapsuleSchedulePreset {
  return typeof value === "string" && SCHEDULE_PRESETS.has(value as CapsuleSchedulePreset);
}
