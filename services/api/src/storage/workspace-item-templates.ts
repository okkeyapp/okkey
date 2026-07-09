import type { QueryExecutor } from "./postgres.ts";

export type WorkspaceItemTemplateRecord = {
  id: string;
  workspaceId: string;
  name: string;
  categoryId: string;
  payloadJson: Record<string, unknown>;
  faviconId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type TemplateRow = {
  id: string;
  workspace_id: string;
  name: string;
  category_id: string;
  payload_json: Record<string, unknown>;
  favicon_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function mapTemplateRow(row: TemplateRow): WorkspaceItemTemplateRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    categoryId: row.category_id,
    payloadJson: row.payload_json,
    faviconId: row.favicon_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WorkspaceItemTemplatesRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceItemTemplateRecord[]> {
    const rows = await this.db.query<TemplateRow>(
      `
        SELECT id, workspace_id, name, category_id, payload_json, favicon_id, created_by, created_at, updated_at
        FROM workspace_item_templates
        WHERE workspace_id = $1
        ORDER BY name ASC, id ASC
      `,
      [workspaceId],
    );
    return rows.map(mapTemplateRow);
  }

  async findById(workspaceId: string, templateId: string): Promise<WorkspaceItemTemplateRecord | null> {
    const rows = await this.db.query<TemplateRow>(
      `
        SELECT id, workspace_id, name, category_id, payload_json, favicon_id, created_by, created_at, updated_at
        FROM workspace_item_templates
        WHERE workspace_id = $1 AND id = $2
      `,
      [workspaceId, templateId],
    );
    return rows[0] ? mapTemplateRow(rows[0]) : null;
  }

  async create(input: {
    id: string;
    workspaceId: string;
    name: string;
    categoryId: string;
    payloadJson: Record<string, unknown>;
    faviconId?: string | null;
    createdBy: string;
  }): Promise<WorkspaceItemTemplateRecord> {
    const rows = await this.db.query<TemplateRow>(
      `
        INSERT INTO workspace_item_templates (
          id, workspace_id, name, category_id, payload_json, favicon_id, created_by
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        RETURNING id, workspace_id, name, category_id, payload_json, favicon_id, created_by, created_at, updated_at
      `,
      [
        input.id,
        input.workspaceId,
        input.name,
        input.categoryId,
        JSON.stringify(input.payloadJson),
        input.faviconId ?? null,
        input.createdBy,
      ],
    );
    return mapTemplateRow(rows[0]);
  }

  async delete(workspaceId: string, templateId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `
        DELETE FROM workspace_item_templates
        WHERE workspace_id = $1 AND id = $2
        RETURNING id
      `,
      [workspaceId, templateId],
    );
    return rows.length > 0;
  }
}
