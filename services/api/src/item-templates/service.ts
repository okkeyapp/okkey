import type { VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceItemTemplatesRepository } from "../storage/workspace-item-templates.ts";
import { WORKSPACE_ITEM_CATEGORY_IDS } from "../item-category-preferences/service.ts";
import type { AttachmentService } from "../attachments/service.ts";
import { isEntityId } from "../entity-id.ts";

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

/** Structural section keys kept in stored template payloads. */
export const TEMPLATE_SECTION_STRUCTURE_KEYS = ["id", "variant", "title", "fields"] as const;

/** Structural field keys kept in stored template payloads (`value` is always cleared). */
export const TEMPLATE_FIELD_STRUCTURE_KEYS = [
  "id",
  "type",
  "label",
  "value",
  "editableLabel",
  "secret",
  "secretKind",
  "deletable",
  "required",
  "urlAutofillScope",
  "disableClickCopy",
  "selectOptions",
] as const;

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
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess" | "isOwnerOrAdmin">;
  vaults: Pick<VaultsRepository, "canReadVault">;
  attachments?: Pick<AttachmentService, "purgeForTemplate">;
}

export class ItemTemplatesService {
  private readonly templates: ItemTemplatesServiceDeps["templates"];
  private readonly workspaces: ItemTemplatesServiceDeps["workspaces"];
  private readonly vaults: ItemTemplatesServiceDeps["vaults"];
  private readonly attachments?: ItemTemplatesServiceDeps["attachments"];

  constructor(deps: ItemTemplatesServiceDeps) {
    this.templates = deps.templates;
    this.workspaces = deps.workspaces;
    this.vaults = deps.vaults;
    this.attachments = deps.attachments;
  }

  async list(workspaceId: string, userId: string) {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const rows = await this.templates.listByWorkspace(workspaceId);
    const visible = [];
    for (const row of rows) {
      const vaultId =
        typeof row.payloadJson.vault_id === "string" ? row.payloadJson.vault_id.trim() : "";
      if (!vaultId) {
        continue;
      }
      const canRead = await this.vaults.canReadVault(vaultId, userId);
      if (!canRead) {
        continue;
      }
      visible.push(toTemplateDto(row));
    }
    return visible;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { id: string; name: string; category_id: string; payload: ItemTemplatePayload; favicon_id?: string | null },
  ) {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const templateId = input.id.trim();
    if (!isEntityId(templateId)) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_ID", 400, "template id is required");
    }
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
      id: templateId,
      name,
      categoryId,
      payloadJson: payload,
      faviconId: input.favicon_id?.trim() || null,
      createdBy: userId,
    });
    return toTemplateDto(row);
  }

  async update(
    workspaceId: string,
    userId: string,
    templateId: string,
    input: { name: string; category_id: string; payload: ItemTemplatePayload; favicon_id?: string | null },
  ) {
    await this.assertWorkspaceAccess(workspaceId, userId);
    const normalizedTemplateId = templateId.trim();
    if (!normalizedTemplateId) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_ID", 400, "template id is required");
    }
    const existing = await this.templates.findById(workspaceId, normalizedTemplateId);
    if (!existing) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
    await this.assertCanMutateTemplate(workspaceId, userId, existing.createdBy);
    const name = input.name.trim();
    if (!name) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_NAME", 400, "template name is required");
    }
    const categoryId = input.category_id.trim();
    if (!allowedCategoryIdSet.has(categoryId)) {
      throw new ItemTemplatesServiceError("INVALID_CATEGORY_ID", 400, "unknown category id");
    }
    const payload = normalizeTemplatePayload(input.payload);
    const row = await this.templates.update({
      workspaceId,
      templateId: normalizedTemplateId,
      name,
      categoryId,
      payloadJson: payload,
      faviconId: input.favicon_id === undefined ? existing.faviconId : input.favicon_id?.trim() || null,
    });
    if (!row) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
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
    await this.assertCanMutateTemplate(workspaceId, userId, existing.createdBy);
    await this.attachments?.purgeForTemplate(
      normalizedTemplateId,
      collectTemplateAttachmentIds(existing.payloadJson, existing.faviconId),
    );

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

  /** Creator, workspace owner, or admin may update/delete a template. */
  private async assertCanMutateTemplate(
    workspaceId: string,
    userId: string,
    createdBy: string,
  ): Promise<void> {
    if (userId === createdBy) {
      return;
    }
    const isManager = await this.workspaces.isOwnerOrAdmin(workspaceId, userId);
    if (!isManager) {
      throw new ItemTemplatesServiceError("ACCESS_DENIED", 403, "access denied");
    }
  }
}

function collectTemplateAttachmentIds(payloadJson: Record<string, unknown>, faviconId: string | null): string[] {
  const ids = new Set<string>();
  const normalizedFaviconId = faviconId?.trim();
  if (normalizedFaviconId) {
    ids.add(normalizedFaviconId);
  }

  const sections = payloadJson.sections;
  if (!Array.isArray(sections)) {
    return [...ids];
  }

  for (const section of sections) {
    if (!section || typeof section !== "object") {
      continue;
    }
    const fields = (section as { fields?: unknown }).fields;
    if (!Array.isArray(fields)) {
      continue;
    }
    for (const field of fields) {
      if (!field || typeof field !== "object") {
        continue;
      }
      const typedField = field as { type?: unknown; value?: unknown };
      if (typedField.type !== "file" || typeof typedField.value !== "string") {
        continue;
      }
      try {
        const parsed = JSON.parse(typedField.value) as { attachmentId?: unknown };
        if (typeof parsed.attachmentId !== "string") {
          continue;
        }
        const attachmentId = parsed.attachmentId.trim();
        if (attachmentId && !attachmentId.startsWith("pending:")) {
          ids.add(attachmentId);
        }
      } catch {
        /* ignore malformed file field payload */
      }
    }
  }

  return [...ids];
}

function pickKnownKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) {
      next[key] = source[key];
    }
  }
  return next;
}

/**
 * Keep only known structural section/field keys; force empty field values.
 * Unknown keys (e.g. note, defaultValue, history) are dropped.
 */
export function stripTemplateSectionValues(sections: unknown[]): unknown[] {
  if (!Array.isArray(sections)) {
    return [];
  }
  const result: Record<string, unknown>[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      continue;
    }
    const src = section as Record<string, unknown>;
    const next = pickKnownKeys(src, TEMPLATE_SECTION_STRUCTURE_KEYS.filter((key) => key !== "fields"));
    const fields = Array.isArray(src.fields) ? src.fields : [];
    next.fields = fields.flatMap((field) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) {
        return [];
      }
      const fieldSrc = field as Record<string, unknown>;
      const fieldOut = pickKnownKeys(
        fieldSrc,
        TEMPLATE_FIELD_STRUCTURE_KEYS.filter((key) => key !== "value"),
      );
      fieldOut.value = "";
      return [fieldOut];
    });
    result.push(next);
  }
  return result;
}

function normalizeTemplatePayload(raw: ItemTemplatePayload): Record<string, unknown> {
  return {
    record_name: "",
    vault_id: typeof raw.vault_id === "string" ? raw.vault_id : "",
    folder_id: typeof raw.folder_id === "string" ? raw.folder_id : "",
    sections: Array.isArray(raw.sections) ? stripTemplateSectionValues(raw.sections) : [],
    tags: [],
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
  const sections = Array.isArray(payload.sections) ? stripTemplateSectionValues(payload.sections) : [];
  return {
    id: row.id,
    name: row.name,
    category_id: row.categoryId,
    payload: {
      record_name: "",
      vault_id: typeof payload.vault_id === "string" ? payload.vault_id : "",
      folder_id: typeof payload.folder_id === "string" ? payload.folder_id : "",
      sections,
      tags: [],
      ...(payload.favicon_source === "manual" || payload.favicon_source === "website"
        ? { favicon_source: payload.favicon_source }
        : {}),
    },
    ...(row.faviconId ? { favicon_id: row.faviconId } : {}),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
