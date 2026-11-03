import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceMemberItemCategoryPreferencesRepository } from "../storage/workspace-member-item-category-preferences.ts";
import type { WorkspaceItemTemplatesRepository } from "../storage/workspace-item-templates.ts";

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

const FAVORITE_ORDER_CATEGORY_PREFIX = "category:";
const FAVORITE_ORDER_TEMPLATE_PREFIX = "template:";

export function encodeFavoriteOrderEntry(type: "category" | "template", id: string): string {
  return `${type === "category" ? FAVORITE_ORDER_CATEGORY_PREFIX : FAVORITE_ORDER_TEMPLATE_PREFIX}${id}`;
}

export function parseFavoriteOrderEntry(value: string): { type: "category" | "template"; id: string } | null {
  if (value.startsWith(FAVORITE_ORDER_CATEGORY_PREFIX)) {
    const id = value.slice(FAVORITE_ORDER_CATEGORY_PREFIX.length).trim();
    return id ? { type: "category", id } : null;
  }
  if (value.startsWith(FAVORITE_ORDER_TEMPLATE_PREFIX)) {
    const id = value.slice(FAVORITE_ORDER_TEMPLATE_PREFIX.length).trim();
    return id ? { type: "template", id } : null;
  }
  return null;
}

export function buildDefaultFavoriteOrder(
  favoriteCategoryIds: readonly string[],
  favoriteTemplateIds: readonly string[],
): string[] {
  return [
    ...favoriteCategoryIds.map((id) => encodeFavoriteOrderEntry("category", id)),
    ...favoriteTemplateIds.map((id) => encodeFavoriteOrderEntry("template", id)),
  ];
}

export function reconcileFavoriteOrder(
  order: readonly string[],
  favoriteCategoryIds: readonly string[],
  favoriteTemplateIds: readonly string[],
): string[] {
  const categorySet = new Set(favoriteCategoryIds);
  const templateSet = new Set(favoriteTemplateIds);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of order) {
    const parsed = parseFavoriteOrderEntry(entry);
    if (!parsed || seen.has(entry)) {
      continue;
    }
    if (parsed.type === "category" && categorySet.has(parsed.id)) {
      seen.add(entry);
      result.push(entry);
    }
    if (parsed.type === "template" && templateSet.has(parsed.id)) {
      seen.add(entry);
      result.push(entry);
    }
  }

  for (const id of favoriteCategoryIds) {
    const entry = encodeFavoriteOrderEntry("category", id);
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }
  for (const id of favoriteTemplateIds) {
    const entry = encodeFavoriteOrderEntry("template", id);
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }

  return result;
}

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
  templates: WorkspaceItemTemplatesRepository;
}

export class ItemCategoryPreferencesService {
  private readonly preferences: ItemCategoryPreferencesServiceDeps["preferences"];
  private readonly workspaces: ItemCategoryPreferencesServiceDeps["workspaces"];
  private readonly templates: ItemCategoryPreferencesServiceDeps["templates"];

  constructor(deps: ItemCategoryPreferencesServiceDeps) {
    this.preferences = deps.preferences;
    this.workspaces = deps.workspaces;
    this.templates = deps.templates;
  }

  /** Public access check so routes can authorize before body validation. */
  async ensureWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    await this.assertWorkspaceAccess(workspaceId, userId);
  }

  async getPreferences(workspaceId: string, userId: string): Promise<{
    favoriteCategoryIds: string[];
    favoriteTemplateIds: string[];
    favoriteOrder: string[];
    personalDataBootstrapDismissed: boolean;
  }> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const row = await this.preferences.find(workspaceId, userId);
    if (!row) {
      const favoriteCategoryIds = [...DEFAULT_WORKSPACE_ITEM_CATEGORY_FAVORITE_IDS];
      return {
        favoriteCategoryIds,
        favoriteTemplateIds: [],
        favoriteOrder: buildDefaultFavoriteOrder(favoriteCategoryIds, []),
        personalDataBootstrapDismissed: false,
      };
    }
    const favoriteCategoryIds = sanitizeFavoriteCategoryIds(row.favoriteCategoryIds);
    const favoriteTemplateIds = await this.sanitizeFavoriteTemplateIds(workspaceId, row.favoriteTemplateIds);
    const favoriteOrder = reconcileFavoriteOrder(
      row.favoriteOrder.length > 0
        ? row.favoriteOrder
        : buildDefaultFavoriteOrder(favoriteCategoryIds, favoriteTemplateIds),
      favoriteCategoryIds,
      favoriteTemplateIds,
    );
    return {
      favoriteCategoryIds,
      favoriteTemplateIds,
      favoriteOrder,
      personalDataBootstrapDismissed: row.personalDataBootstrapDismissed,
    };
  }

  async getFavoriteCategoryIds(workspaceId: string, userId: string): Promise<string[]> {
    const prefs = await this.getPreferences(workspaceId, userId);
    return prefs.favoriteCategoryIds;
  }

  async updatePreferences(
    workspaceId: string,
    userId: string,
    input: {
      favoriteCategoryIds: string[];
      favoriteTemplateIds: string[];
      favoriteOrder: string[];
      personalDataBootstrapDismissed?: boolean;
    },
  ): Promise<{
    favoriteCategoryIds: string[];
    favoriteTemplateIds: string[];
    favoriteOrder: string[];
    personalDataBootstrapDismissed: boolean;
  }> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const sanitizedCategories = sanitizeFavoriteCategoryIds(input.favoriteCategoryIds);
    const sanitizedTemplates = await this.sanitizeFavoriteTemplateIds(workspaceId, input.favoriteTemplateIds);
    const sanitizedOrder = reconcileFavoriteOrder(
      input.favoriteOrder,
      sanitizedCategories,
      sanitizedTemplates,
    );
    const row = await this.preferences.upsert({
      workspaceId,
      userId,
      favoriteCategoryIds: sanitizedCategories,
      favoriteTemplateIds: sanitizedTemplates,
      favoriteOrder: sanitizedOrder,
      personalDataBootstrapDismissed: input.personalDataBootstrapDismissed,
    });
    const favoriteCategoryIds = sanitizeFavoriteCategoryIds(row.favoriteCategoryIds);
    const favoriteTemplateIds = await this.sanitizeFavoriteTemplateIds(workspaceId, row.favoriteTemplateIds);
    return {
      favoriteCategoryIds,
      favoriteTemplateIds,
      favoriteOrder: reconcileFavoriteOrder(row.favoriteOrder, favoriteCategoryIds, favoriteTemplateIds),
      personalDataBootstrapDismissed: row.personalDataBootstrapDismissed,
    };
  }

  /**
   * Persist that the member dismissed personal_data bootstrap (e.g. deleted the item).
   * Creates a preferences row with default favorites when none exists yet.
   * No-op write when the stored value already matches `dismissed`.
   */
  async setPersonalDataBootstrapDismissed(
    workspaceId: string,
    userId: string,
    dismissed: boolean,
  ): Promise<{
    favoriteCategoryIds: string[];
    favoriteTemplateIds: string[];
    favoriteOrder: string[];
    personalDataBootstrapDismissed: boolean;
  }> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const current = await this.preferences.find(workspaceId, userId);
    if (current && current.personalDataBootstrapDismissed === dismissed) {
      const favoriteCategoryIds = sanitizeFavoriteCategoryIds(current.favoriteCategoryIds);
      const favoriteTemplateIds = await this.sanitizeFavoriteTemplateIds(
        workspaceId,
        current.favoriteTemplateIds,
      );
      return {
        favoriteCategoryIds,
        favoriteTemplateIds,
        favoriteOrder: reconcileFavoriteOrder(
          current.favoriteOrder.length > 0
            ? current.favoriteOrder
            : buildDefaultFavoriteOrder(favoriteCategoryIds, favoriteTemplateIds),
          favoriteCategoryIds,
          favoriteTemplateIds,
        ),
        personalDataBootstrapDismissed: current.personalDataBootstrapDismissed,
      };
    }
    const existing = await this.preferences.setPersonalDataBootstrapDismissed({
      workspaceId,
      userId,
      dismissed,
    });
    if (existing) {
      const favoriteCategoryIds = sanitizeFavoriteCategoryIds(existing.favoriteCategoryIds);
      const favoriteTemplateIds = await this.sanitizeFavoriteTemplateIds(
        workspaceId,
        existing.favoriteTemplateIds,
      );
      return {
        favoriteCategoryIds,
        favoriteTemplateIds,
        favoriteOrder: reconcileFavoriteOrder(
          existing.favoriteOrder.length > 0
            ? existing.favoriteOrder
            : buildDefaultFavoriteOrder(favoriteCategoryIds, favoriteTemplateIds),
          favoriteCategoryIds,
          favoriteTemplateIds,
        ),
        personalDataBootstrapDismissed: existing.personalDataBootstrapDismissed,
      };
    }
    const favoriteCategoryIds = [...DEFAULT_WORKSPACE_ITEM_CATEGORY_FAVORITE_IDS];
    const favoriteTemplateIds: string[] = [];
    const favoriteOrder = buildDefaultFavoriteOrder(favoriteCategoryIds, favoriteTemplateIds);
    return this.updatePreferences(workspaceId, userId, {
      favoriteCategoryIds,
      favoriteTemplateIds,
      favoriteOrder,
      personalDataBootstrapDismissed: dismissed,
    });
  }

  async updateFavoriteCategoryIds(
    workspaceId: string,
    userId: string,
    favoriteCategoryIds: string[],
  ): Promise<string[]> {
    const current = await this.getPreferences(workspaceId, userId);
    const updated = await this.updatePreferences(workspaceId, userId, {
      favoriteCategoryIds,
      favoriteTemplateIds: current.favoriteTemplateIds,
      favoriteOrder: current.favoriteOrder,
    });
    return updated.favoriteCategoryIds;
  }

  async updateFavoriteTemplateIds(
    workspaceId: string,
    userId: string,
    favoriteTemplateIds: string[],
  ): Promise<string[]> {
    const current = await this.getPreferences(workspaceId, userId);
    const updated = await this.updatePreferences(workspaceId, userId, {
      favoriteCategoryIds: current.favoriteCategoryIds,
      favoriteTemplateIds,
      favoriteOrder: current.favoriteOrder,
    });
    return updated.favoriteTemplateIds;
  }

  private async sanitizeFavoriteTemplateIds(workspaceId: string, raw: string[]): Promise<string[]> {
    const workspaceTemplates = await this.templates.listByWorkspace(workspaceId);
    const allowed = new Set(workspaceTemplates.map((template) => template.id));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of raw) {
      if (!allowed.has(value) || seen.has(value)) {
        continue;
      }
      seen.add(value);
      result.push(value);
    }
    return result;
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

export function parseFavoriteTemplateIdsPayload(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((entry) => typeof entry === "string")) {
    return null;
  }
  return value;
}

export function parseFavoriteOrderPayload(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((entry) => typeof entry === "string")) {
    return null;
  }
  return value.filter((entry) => parseFavoriteOrderEntry(entry) !== null);
}

export function parsePersonalDataBootstrapDismissedPayload(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null;
  }
  return value;
}
