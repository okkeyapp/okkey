import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceItemTemplatesRepository } from "../storage/workspace-item-templates.ts";
import { WORKSPACE_ITEM_CATEGORY_IDS } from "../item-category-preferences/service.ts";

export class ItemTemplatesServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const allowedCategoryIdSet = new Set<string>(WORKSPACE_ITEM_CATEGORY_IDS);

export type ItemTemplatePayload = {
  record_name: string;
  vault_id: string;
  folder_id: string;
  sections: unknown[];
  tags: string[];
  favicon_source?: string;
};

export interface ItemTemplatesServiceDeps {
  templates: WorkspaceItemTemplatesRepository;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
}

export class ItemTemplatesService {
  private readonly templates: ItemTemplatesServiceDeps["templates"];
  private readonly workspaces: ItemTemplatesServiceDeps["workspaces"];

  constructor(deps: ItemTemplatesServiceDeps) {
    this.templates = deps.templates;
    this.workspaces = deps.workspaces;
  }

  async list(workspaceId: string, userId: string) {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const rows = await this.templates.listByWorkspace(workspaceId);
    return rows.map(toTemplateDto);
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { name: string; category_id: string; payload: ItemTemplatePayload; favicon_id?: string | null },
  ) {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const name = input.name.trim();
    if (!name) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_NAME", 400, "template name is required");
    }
    const categoryId = input.category_id.trim();
    if (!allowedCategoryIdSet.has(categoryId)) {
      throw new ItemTemplatesServiceError("INVALID_CATEGORY_ID", 400, "unknown category id");
    }
    const payload = normalizeTemplatePayload(input.payload);
    const row = await this.templates.create({
      workspaceId,
      name,
      categoryId,
      payloadJson: payload,
      faviconId: input.favicon_id?.trim() || null,
      createdBy: userId,
    });
    return toTemplateDto(row);
  }

  async delete(workspaceId: string, userId: string, templateId: string): Promise<void> {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const normalizedTemplateId = templateId.trim();
    if (!normalizedTemplateId) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_ID", 400, "template id is required");
    }
    const existing = await this.templates.findById(workspaceId, normalizedTemplateId);
    if (!existing) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
    const deleted = await this.templates.delete(workspaceId, normalizedTemplateId);
    if (!deleted) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
  }

  private async assertWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new ItemTemplatesServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new ItemTemplatesServiceError("ACCESS_DENIED", 403, "access denied");
    }
  }
}

function normalizeTemplatePayload(raw: ItemTemplatePayload): Record<string, unknown> {
  return {
    record_name: typeof raw.record_name === "string" ? raw.record_name : "",
    vault_id: typeof raw.vault_id === "string" ? raw.vault_id : "",
    folder_id: typeof raw.folder_id === "string" ? raw.folder_id : "",
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : [],
    ...(raw.favicon_source === "manual" || raw.favicon_source === "website"
      ? { favicon_source: raw.favicon_source }
      : {}),
  };
}

function toTemplateDto(row: {
  id: string;
  name: string;
  categoryId: string;
  payloadJson: Record<string, unknown>;
  faviconId: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  const payload = row.payloadJson;
  return {
    id: row.id,
    name: row.name,
    category_id: row.categoryId,
    payload: {
      record_name: typeof payload.record_name === "string" ? payload.record_name : "",
      vault_id: typeof payload.vault_id === "string" ? payload.vault_id : "",
      folder_id: typeof payload.folder_id === "string" ? payload.folder_id : "",
      sections: Array.isArray(payload.sections) ? payload.sections : [],
      tags: Array.isArray(payload.tags)
        ? payload.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      ...(payload.favicon_source === "manual" || payload.favicon_source === "website"
        ? { favicon_source: payload.favicon_source }
        : {}),
    },
    ...(row.faviconId ? { favicon_id: row.faviconId } : {}),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
