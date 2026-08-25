import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import {
  assertWorkspacePermission,
  WorkspacePermissionError,
} from "../workspace-roles/permissions.ts";
import {
  MAX_MAX_FILE_SIZE_MB,
  MIN_MAX_FILE_SIZE_MB,
  normalizeAllowedFileExtensions,
  workspaceCapsulePoliciesFromDto,
  workspaceCapsulePoliciesToDto,
  type WorkspaceCapsulePolicies,
  type WorkspaceCapsulePoliciesDto,
} from "@okkey/types";

export const DEFAULT_DELETED_ITEMS_RETENTION_DAYS = 30;
export const DEFAULT_WORKSPACE_TILE_COLOR = "#3B82F6";

export const MIN_DELETED_ITEMS_RETENTION_DAYS = 1;
export const MAX_DELETED_ITEMS_RETENTION_DAYS = 3650;

export type WorkspaceSettingsSnapshot = {
  name: string;
  deletedItemsRetentionDays: number;
  allowedFileExtensions: string[];
  maxFileSizeMb: number;
  filesInItemsEnabled: boolean;
  capsulePolicies: WorkspaceCapsulePolicies;
  tileColor: string | null;
  logoVaultId: string | null;
  logoAttachmentId: string | null;
};

export type WorkspaceSettingsPatch = {
  name?: string;
  deletedItemsRetentionDays?: number;
  allowedFileExtensions?: string[];
  maxFileSizeMb?: number;
  filesInItemsEnabled?: boolean;
  capsulePolicies?: WorkspaceCapsulePolicies;
  tileColor?: string | null;
  logoVaultId?: string | null;
  logoAttachmentId?: string | null;
};

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
    "findById" | "hasAccess" | "updateGeneralSettings" | "deleteOwnedWorkspace"
  >;
  db: QueryExecutor;
}

export class WorkspaceSettingsService {
  private readonly workspaces: WorkspaceSettingsServiceDeps["workspaces"];
  private readonly db: QueryExecutor;

  constructor(deps: WorkspaceSettingsServiceDeps) {
    this.workspaces = deps.workspaces;
    this.db = deps.db;
  }

  async getSettings(workspaceId: string, userId: string): Promise<WorkspaceSettingsSnapshot> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, userId);
    await this.assertSettings(workspaceId, userId, "get");
    return toSettingsSnapshot(workspace);
  }

  async updateSettings(
    workspaceId: string,
    userId: string,
    patch: WorkspaceSettingsPatch,
  ): Promise<WorkspaceSettingsSnapshot> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, userId);
    await this.assertSettings(workspaceId, userId, "put");

    const update: Parameters<WorkspacesRepository["updateGeneralSettings"]>[1] = {};
    if (patch.name !== undefined) {
      update.name = sanitizeWorkspaceName(patch.name);
    }
    if (patch.deletedItemsRetentionDays !== undefined) {
      update.deletedItemsRetentionDays = sanitizeDeletedItemsRetentionDays(patch.deletedItemsRetentionDays);
    }
    if (patch.allowedFileExtensions !== undefined) {
      update.allowedFileExtensions = sanitizeAllowedFileExtensions(patch.allowedFileExtensions);
    }
    if (patch.maxFileSizeMb !== undefined) {
      update.maxFileSizeMb = sanitizeMaxFileSizeMb(patch.maxFileSizeMb);
    }
    if (patch.filesInItemsEnabled !== undefined) {
      update.filesInItemsEnabled = sanitizeFilesInItemsEnabled(patch.filesInItemsEnabled);
    }
    if (patch.capsulePolicies !== undefined) {
      update.capsulePolicies = sanitizeCapsulePolicies(patch.capsulePolicies);
    }
    if (patch.tileColor !== undefined) {
      update.tileColor = patch.tileColor === null ? null : sanitizeTileColor(patch.tileColor);
    }
    if (patch.logoVaultId !== undefined) {
      update.logoVaultId = patch.logoVaultId;
    }
    if (patch.logoAttachmentId !== undefined) {
      update.logoAttachmentId = patch.logoAttachmentId;
    }

    if (Object.keys(update).length === 0) {
      return toSettingsSnapshot(workspace);
    }

    const updated = await this.workspaces.updateGeneralSettings(workspaceId, update);
    return toSettingsSnapshot(updated);
  }

  async deleteWorkspace(workspaceId: string, userId: string, confirmationName: string): Promise<void> {
    const workspace = await this.requireOwnerWorkspace(workspaceId, userId);
    if (confirmationName.trim() !== workspace.name) {
      throw new WorkspaceSettingsServiceError(
        "INVALID_CONFIRMATION_NAME",
        400,
        "confirmation name does not match workspace name",
      );
    }
    const deleted = await this.workspaces.deleteOwnedWorkspace(workspaceId, userId);
    if (!deleted) {
      throw new WorkspaceSettingsServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
  }

  private async assertSettings(
    workspaceId: string,
    userId: string,
    action: "get" | "put",
  ): Promise<void> {
    try {
      await assertWorkspacePermission(this.db, workspaceId, userId, "settings", action);
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        throw new WorkspaceSettingsServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
  }

  private async requireAccessibleWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceSettingsServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceSettingsServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }

  private async requireOwnerWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, userId);
    if (workspace.ownerId !== userId) {
      throw new WorkspaceSettingsServiceError(
        "ACCESS_DENIED",
        403,
        "only workspace owner can delete workspace",
      );
    }
    return workspace;
  }
}

function toSettingsSnapshot(workspace: {
  name: string;
  deletedItemsRetentionDays: number;
  allowedFileExtensions: string[];
  maxFileSizeMb: number;
  filesInItemsEnabled: boolean;
  capsulePolicies: WorkspaceCapsulePolicies;
  tileColor: string | null;
  logoVaultId: string | null;
  logoAttachmentId: string | null;
}): WorkspaceSettingsSnapshot {
  return {
    name: workspace.name,
    deletedItemsRetentionDays: workspace.deletedItemsRetentionDays,
    allowedFileExtensions: workspace.allowedFileExtensions,
    maxFileSizeMb: workspace.maxFileSizeMb,
    filesInItemsEnabled: workspace.filesInItemsEnabled,
    capsulePolicies: workspace.capsulePolicies,
    tileColor: workspace.tileColor,
    logoVaultId: workspace.logoVaultId,
    logoAttachmentId: workspace.logoAttachmentId,
  };
}

export function sanitizeWorkspaceName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new WorkspaceSettingsServiceError("INVALID_WORKSPACE_NAME", 400, "workspace name is required");
  }
  if (trimmed.length > 120) {
    throw new WorkspaceSettingsServiceError("INVALID_WORKSPACE_NAME", 400, "workspace name is too long");
  }
  return trimmed;
}

export function sanitizeTileColor(value: string): string {
  const normalized = value.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    throw new WorkspaceSettingsServiceError("INVALID_TILE_COLOR", 400, "tile color must be a hex value");
  }
  if (normalized.length === 4) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return normalized.toLowerCase();
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

export function sanitizeAllowedFileExtensions(value: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_ALLOWED_FILE_EXTENSIONS",
      400,
      "allowed_file_extensions must be an array of strings",
    );
  }
  if (value.length > 100) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_ALLOWED_FILE_EXTENSIONS",
      400,
      "allowed_file_extensions is too long",
    );
  }
  for (const item of value) {
    if (typeof item !== "string") {
      throw new WorkspaceSettingsServiceError(
        "INVALID_ALLOWED_FILE_EXTENSIONS",
        400,
        "allowed_file_extensions must be an array of strings",
      );
    }
  }
  return normalizeAllowedFileExtensions(value);
}

export function parseAllowedFileExtensionsPayload(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  try {
    return sanitizeAllowedFileExtensions(value);
  } catch {
    return null;
  }
}

export function sanitizeMaxFileSizeMb(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_MAX_FILE_SIZE_MB",
      400,
      "max_file_size_mb must be an integer",
    );
  }

  if (value < MIN_MAX_FILE_SIZE_MB || value > MAX_MAX_FILE_SIZE_MB) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_MAX_FILE_SIZE_MB",
      400,
      `max_file_size_mb must be between ${MIN_MAX_FILE_SIZE_MB} and ${MAX_MAX_FILE_SIZE_MB}`,
    );
  }
  return value;
}

export function parseMaxFileSizeMbPayload(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  try {
    return sanitizeMaxFileSizeMb(value);
  } catch {
    return null;
  }
}

export function sanitizeFilesInItemsEnabled(value: boolean): boolean {
  if (typeof value !== "boolean") {
    throw new WorkspaceSettingsServiceError(
      "INVALID_FILES_IN_ITEMS_ENABLED",
      400,
      "files_in_items_enabled must be a boolean",
    );
  }
  return value;
}

export function parseFilesInItemsEnabledPayload(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null;
  }
  return sanitizeFilesInItemsEnabled(value);
}

export function sanitizeCapsulePolicies(value: WorkspaceCapsulePolicies): WorkspaceCapsulePolicies {
  const normalized = workspaceCapsulePoliciesFromDto(workspaceCapsulePoliciesToDto(value));
  if (normalized.forceMaxViews > 10_000) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_CAPSULE_POLICIES",
      400,
      "capsule_policies.force_max_views must be between 0 and 10000",
    );
  }
  if (normalized.passwordAttemptLimit > 100) {
    throw new WorkspaceSettingsServiceError(
      "INVALID_CAPSULE_POLICIES",
      400,
      "capsule_policies.password_attempt_limit must be between 0 and 100",
    );
  }
  return normalized;
}

export function parseCapsulePoliciesPayload(
  value: unknown,
): WorkspaceCapsulePolicies | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  try {
    return sanitizeCapsulePolicies(
      workspaceCapsulePoliciesFromDto(value as Partial<WorkspaceCapsulePoliciesDto>),
    );
  } catch (error) {
    if (error instanceof WorkspaceSettingsServiceError) {
      throw error;
    }
    return null;
  }
}

export function parseOptionalStringPayload(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

export function parseOptionalNamePayload(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}
