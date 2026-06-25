import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceMemberItemCategoryPreferencesRepository } from "../storage/workspace-member-item-category-preferences.ts";

export const DEFAULT_WORKSPACE_ITEM_CATEGORY_FAVORITE_IDS = [
  "login",
  "secure_note",
  "credit_card",
  "personal_data",
  "passport",
  "secure_files",
] as const;

export const WORKSPACE_ITEM_CATEGORY_IDS = [
  "login",
  "secure_note",
  "credit_card",
  "personal_data",
  "passport",
  "secure_files",
  "api_access",
  "ssh_key",
  "database",
  "server",
  "wifi_router",
  "bank_account",
  "crypto_wallet",
] as const;

const allowedCategoryIdSet = new Set<string>(WORKSPACE_ITEM_CATEGORY_IDS);

export class ItemCategoryPreferencesServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ItemCategoryPreferencesServiceDeps {
  preferences: WorkspaceMemberItemCategoryPreferencesRepository;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
}

export class ItemCategoryPreferencesService {
  private readonly preferences: ItemCategoryPreferencesServiceDeps["preferences"];
  private readonly workspaces: ItemCategoryPreferencesServiceDeps["workspaces"];

  constructor(deps: ItemCategoryPreferencesServiceDeps) {
    this.preferences = deps.preferences;
    this.workspaces = deps.workspaces;
  }

  async getFavoriteCategoryIds(workspaceId: string, userId: string): Promise<string[]> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const row = await this.preferences.find(workspaceId, userId);
    if (!row) {
      return [...DEFAULT_WORKSPACE_ITEM_CATEGORY_FAVORITE_IDS];
    }
    return sanitizeFavoriteCategoryIds(row.favoriteCategoryIds);
  }

  async updateFavoriteCategoryIds(
    workspaceId: string,
    userId: string,
    favoriteCategoryIds: string[],
  ): Promise<string[]> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const sanitized = sanitizeFavoriteCategoryIds(favoriteCategoryIds);
    const row = await this.preferences.upsert({
      workspaceId,
      userId,
      favoriteCategoryIds: sanitized,
    });
    return sanitizeFavoriteCategoryIds(row.favoriteCategoryIds);
  }

  private async assertWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new ItemCategoryPreferencesServiceError(
        "WORKSPACE_NOT_FOUND",
        404,
        "workspace not found",
      );
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new ItemCategoryPreferencesServiceError("ACCESS_DENIED", 403, "access denied");
    }
  }
}

export function sanitizeFavoriteCategoryIds(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    if (!allowedCategoryIdSet.has(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function parseFavoriteCategoryIdsPayload(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((entry) => typeof entry === "string")) {
    return null;
  }
  return sanitizeFavoriteCategoryIds(value);
}
