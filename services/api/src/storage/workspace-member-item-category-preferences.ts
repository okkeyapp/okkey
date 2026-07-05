import { generateEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "./postgres.ts";

export type WorkspaceMemberItemCategoryPreferencesRecord = {
  workspaceId: string;
  userId: string;
  favoriteCategoryIds: string[];
  favoriteTemplateIds: string[];
  favoriteOrder: string[];
  createdAt: string;
  updatedAt: string;
};

type PreferencesRow = {
  workspace_id: string;
  user_id: string;
  favorite_category_ids: unknown;
  favorite_template_ids?: unknown;
  favorite_order?: unknown;
  created_at: string;
  updated_at: string;
};

function mapPreferencesRow(row: PreferencesRow): WorkspaceMemberItemCategoryPreferencesRecord {
  const favoriteCategoryIds = Array.isArray(row.favorite_category_ids)
    ? row.favorite_category_ids.filter((value): value is string => typeof value === "string")
    : [];
  const favoriteTemplateIds = Array.isArray(row.favorite_template_ids)
    ? row.favorite_template_ids.filter((value): value is string => typeof value === "string")
    : [];
  const favoriteOrder = Array.isArray(row.favorite_order)
    ? row.favorite_order.filter((value): value is string => typeof value === "string")
    : [];
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    favoriteCategoryIds,
    favoriteTemplateIds,
    favoriteOrder,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WorkspaceMemberItemCategoryPreferencesRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async find(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberItemCategoryPreferencesRecord | null> {
    const rows = await this.db.query<PreferencesRow>(
      `
        SELECT workspace_id, user_id, favorite_category_ids, favorite_template_ids, favorite_order, created_at, updated_at
        FROM workspace_member_item_category_preferences
        WHERE workspace_id = $1 AND user_id = $2
      `,
      [workspaceId, userId],
    );
    return rows[0] ? mapPreferencesRow(rows[0]) : null;
  }

  async upsert(input: {
    workspaceId: string;
    userId: string;
    favoriteCategoryIds: string[];
    favoriteTemplateIds: string[];
    favoriteOrder: string[];
  }): Promise<WorkspaceMemberItemCategoryPreferencesRecord> {
    const id = generateEntityId();
    const rows = await this.db.query<PreferencesRow>(
      `
        INSERT INTO workspace_member_item_category_preferences (
          id,
          workspace_id,
          user_id,
          favorite_category_ids,
          favorite_template_ids,
          favorite_order
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET
          favorite_category_ids = EXCLUDED.favorite_category_ids,
          favorite_template_ids = EXCLUDED.favorite_template_ids,
          favorite_order = EXCLUDED.favorite_order,
          updated_at = now()
        RETURNING workspace_id, user_id, favorite_category_ids, favorite_template_ids, favorite_order, created_at, updated_at
      `,
      [
        id,
        input.workspaceId,
        input.userId,
        JSON.stringify(input.favoriteCategoryIds),
        JSON.stringify(input.favoriteTemplateIds),
        JSON.stringify(input.favoriteOrder),
      ],
    );
    return mapPreferencesRow(rows[0]);
  }
}
