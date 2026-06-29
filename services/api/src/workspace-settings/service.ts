import type { WorkspacesRepository } from "../storage/repositories.ts";

export const DEFAULT_DELETED_ITEMS_RETENTION_DAYS = 30;

export const MIN_DELETED_ITEMS_RETENTION_DAYS = 1;
export const MAX_DELETED_ITEMS_RETENTION_DAYS = 3650;

export class WorkspaceSettingsServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface WorkspaceSettingsServiceDeps {
  workspaces: Pick<
    WorkspacesRepository,
    "findById" | "hasAccess" | "getDeletedItemsRetentionDays" | "updateDeletedItemsRetentionDays"
  >;
}

export class WorkspaceSettingsService {
  private readonly workspaces: WorkspaceSettingsServiceDeps["workspaces"];

  constructor(deps: WorkspaceSettingsServiceDeps) {
    this.workspaces = deps.workspaces;
  }

  async getSettings(workspaceId: string, userId: string): Promise<{ deletedItemsRetentionDays: number }> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const retentionDays =
      (await this.workspaces.getDeletedItemsRetentionDays(workspaceId)) ??
      DEFAULT_DELETED_ITEMS_RETENTION_DAYS;
    return { deletedItemsRetentionDays: retentionDays };
  }

  async updateSettings(
    workspaceId: string,
    userId: string,
    deletedItemsRetentionDays: number,
  ): Promise<{ deletedItemsRetentionDays: number }> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceSettingsServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceSettingsServiceError("ACCESS_DENIED", 403, "access denied");
    }
    if (workspace.ownerId !== userId) {
      throw new WorkspaceSettingsServiceError(
        "ACCESS_DENIED",
        403,
        "only workspace owner can update settings",
      );
    }
    const sanitized = sanitizeDeletedItemsRetentionDays(deletedItemsRetentionDays);
    const updated = await this.workspaces.updateDeletedItemsRetentionDays(workspaceId, sanitized);
    return { deletedItemsRetentionDays: updated };
  }

  private async assertWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceSettingsServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceSettingsServiceError("ACCESS_DENIED", 403, "access denied");
    }
  }
}

export function sanitizeDeletedItemsRetentionDays(value: number): number {
  if (!Number.isInteger(value)) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_RETENTION_DAYS",
      400,
      "deleted_items_retention_days must be an integer",
    );
  }
  if (value < MIN_DELETED_ITEMS_RETENTION_DAYS || value > MAX_DELETED_ITEMS_RETENTION_DAYS) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_RETENTION_DAYS",
      400,
      `deleted_items_retention_days must be between ${MIN_DELETED_ITEMS_RETENTION_DAYS} and ${MAX_DELETED_ITEMS_RETENTION_DAYS}`,
    );
  }
  return value;
}

export function parseDeletedItemsRetentionDaysPayload(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  try {
    return sanitizeDeletedItemsRetentionDays(value);
  } catch {
    return null;
  }
}
