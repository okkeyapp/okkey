/**
 * Per-member capsule access defaults.
 * Core mounts GET/PUT `/workspaces/:workspaceId/capsule-defaults` and matches first,
 * so a later enterprise plugin route does not see the write. The PUT path rejects a
 * lapsed enterprise license. GET stays open. Other plans keep the previous write behaviour.
 */
import { workspacePlanFeatureWriteDecision, type PlanEntitlementRuntimeConfig } from "../plan-entitlements.ts";
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

const CAPSULE_TYPE_VALUES: CapsuleDefaultsType[] = ["text", "file", "item"];
const CAPSULE_TYPES = new Set<CapsuleDefaultsType>(CAPSULE_TYPE_VALUES);
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
  config?: PlanEntitlementRuntimeConfig;
}

export class CapsuleDefaultsService {
  private readonly defaults: CapsuleDefaultsServiceDeps["defaults"];
  private readonly workspaces: CapsuleDefaultsServiceDeps["workspaces"];
  private readonly config: PlanEntitlementRuntimeConfig | undefined;

  constructor(deps: CapsuleDefaultsServiceDeps) {
    this.defaults = deps.defaults;
    this.workspaces = deps.workspaces;
    this.config = deps.config;
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
    settings: CapsuleAccessDefaults,
  ): Promise<{ settings: CapsuleAccessDefaults }> {
    const workspace = await this.assertWorkspaceAccess(workspaceId, userId);
    this.assertWritable(workspace);
    const normalized = normalizeCapsuleAccessDefaults(settings);
    let lastSettings = normalized;
    for (const capsuleType of CAPSULE_TYPE_VALUES) {
      const row = await this.defaults.upsert({
        workspaceId,
        userId,
        capsuleType,
        settings: normalized,
      });
      lastSettings = normalizeCapsuleAccessDefaults(row.settings);
    }
    return { settings: lastSettings };
  }

  private async assertWorkspaceAccess(workspaceId: string, userId: string) {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new CapsuleDefaultsServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new CapsuleDefaultsServiceError("FORBIDDEN", 403, "workspace access required");
    }
    return workspace;
  }

  /** Lapsed enterprise modules cannot save new defaults. Other plans are unchanged. */
  private assertWritable(workspace: {
    planTier?: string | null;
    planCustomOverride?: boolean | null;
    planFeatureOverrides?: import("@okkey/types").PlanFeatureOverrides | null;
  }): void {
    if (!this.config) {
      return;
    }
    const decision = workspacePlanFeatureWriteDecision(
      this.config,
      workspace,
      "capsuleAccessSettings",
    );
    if (!decision.allowed && decision.code === "PLAN_LICENSE_LAPSED") {
      throw new CapsuleDefaultsServiceError(decision.code, decision.status, decision.message);
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
