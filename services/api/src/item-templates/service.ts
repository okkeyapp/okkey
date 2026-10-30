import type { VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceItemTemplatesRepository } from "../storage/workspace-item-templates.ts";
import { WORKSPACE_ITEM_CATEGORY_IDS } from "../item-category-preferences/service.ts";
import type { AttachmentService } from "../attachments/service.ts";
import { UniqueConstraintError } from "../storage/errors.ts";
import { generateEntityId, isEntityId } from "../entity-id.ts";

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

const SECTION_VARIANTS = new Set(["primary", "additional"]);
const SECRET_KINDS = new Set(["password", "single-line", "multi-line"]);
const URL_AUTOFILL_SCOPES = new Set(["entire-site", "exact-url", "none"]);

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
  vaults: Pick<VaultsRepository, "canReadVault" | "findById">;
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
    const normalizedWorkspaceId = await this.assertWorkspaceAccess(workspaceId, userId);
    const rows = await this.templates.listByWorkspace(normalizedWorkspaceId);
    const visible = [];
    for (const row of rows) {
      const vaultId =
        typeof row.payloadJson.vault_id === "string" ? row.payloadJson.vault_id.trim() : "";
      // Skip broken / non-entity vault ids so one bad row cannot fail the whole list.
      if (!vaultId || !isEntityId(vaultId)) {
        continue;
      }
      let canRead = false;
      try {
        canRead = await this.vaults.canReadVault(vaultId, userId);
      } catch {
        continue;
      }
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
    input: {
      /**
       * Optional client hint. When present it must be a valid entity id (else 400), but
       * the value is never stored: template ids are a global PK, and accepting a
       * client-chosen id would let callers distinguish free vs taken (including in
       * other workspaces). The server always allocates the id; response is 201 either way.
       */
      id?: string | null;
      name: string;
      category_id: string;
      payload: ItemTemplatePayload;
      favicon_id?: string | null;
    },
  ) {
    const normalizedWorkspaceId = await this.assertWorkspaceAccess(workspaceId, userId);
    const requestedId = typeof input.id === "string" ? input.id.trim() : "";
    if (requestedId && !isEntityId(requestedId)) {
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
    const vaultId = await this.assertTemplateVault(normalizedWorkspaceId, userId, input.payload.vault_id);
    const payload = normalizeTemplatePayload(input.payload, vaultId);
    const faviconId = normalizeOptionalFaviconId(input.favicon_id);
    let templateId = generateEntityId();
    let row;
    try {
      row = await this.templates.create({
        workspaceId: normalizedWorkspaceId,
        id: templateId,
        name,
        categoryId,
        payloadJson: payload,
        faviconId,
        createdBy: userId,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      // Extremely unlikely snowflake collision: retry once with a fresh id.
      templateId = generateEntityId();
      try {
        row = await this.templates.create({
          workspaceId: normalizedWorkspaceId,
          id: templateId,
          name,
          categoryId,
          payloadJson: payload,
          faviconId,
          createdBy: userId,
        });
      } catch (retryError) {
        if (isUniqueConstraintError(retryError)) {
          throw new ItemTemplatesServiceError("TEMPLATE_ID_CONFLICT", 409, "template id is already in use");
        }
        throw retryError;
      }
    }
    return toTemplateDto(row);
  }

  async update(
    workspaceId: string,
    userId: string,
    templateId: string,
    input: { name: string; category_id: string; payload: ItemTemplatePayload; favicon_id?: string | null },
  ) {
    const normalizedWorkspaceId = await this.assertWorkspaceAccess(workspaceId, userId);
    const normalizedTemplateId = templateId.trim();
    if (!isEntityId(normalizedTemplateId)) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_ID", 400, "template id is required");
    }
    const existing = await this.templates.findById(normalizedWorkspaceId, normalizedTemplateId);
    if (!existing) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
    await this.assertCanMutateTemplate(normalizedWorkspaceId, userId, existing.createdBy);
    const name = input.name.trim();
    if (!name) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_NAME", 400, "template name is required");
    }
    const categoryId = input.category_id.trim();
    if (!allowedCategoryIdSet.has(categoryId)) {
      throw new ItemTemplatesServiceError("INVALID_CATEGORY_ID", 400, "unknown category id");
    }
    const vaultId = await this.assertTemplateVault(normalizedWorkspaceId, userId, input.payload.vault_id);
    const payload = normalizeTemplatePayload(input.payload, vaultId);
    const faviconId =
      input.favicon_id === undefined ? existing.faviconId : normalizeOptionalFaviconId(input.favicon_id);
    const row = await this.templates.update({
      workspaceId: normalizedWorkspaceId,
      templateId: normalizedTemplateId,
      name,
      categoryId,
      payloadJson: payload,
      faviconId,
    });
    if (!row) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
    return toTemplateDto(row);
  }

  async delete(workspaceId: string, userId: string, templateId: string): Promise<void> {
    const normalizedWorkspaceId = await this.assertWorkspaceAccess(workspaceId, userId);
    const normalizedTemplateId = templateId.trim();
    if (!isEntityId(normalizedTemplateId)) {
      throw new ItemTemplatesServiceError("INVALID_TEMPLATE_ID", 400, "template id is required");
    }
    const existing = await this.templates.findById(normalizedWorkspaceId, normalizedTemplateId);
    if (!existing) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
    await this.assertCanMutateTemplate(normalizedWorkspaceId, userId, existing.createdBy);
    await this.attachments?.purgeForTemplate(
      normalizedTemplateId,
      collectTemplateAttachmentIds(existing.payloadJson, existing.faviconId),
    );

    const deleted = await this.templates.delete(normalizedWorkspaceId, normalizedTemplateId);
    if (!deleted) {
      throw new ItemTemplatesServiceError("TEMPLATE_NOT_FOUND", 404, "template not found");
    }
  }

  private async assertWorkspaceAccess(workspaceId: string, userId: string): Promise<string> {
    const normalizedWorkspaceId = workspaceId.trim();
    if (!isEntityId(normalizedWorkspaceId)) {
      throw new ItemTemplatesServiceError("INVALID_WORKSPACE_ID", 400, "workspace id is required");
    }
    const workspace = await this.workspaces.findById(normalizedWorkspaceId);
    if (!workspace) {
      throw new ItemTemplatesServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(normalizedWorkspaceId, userId);
    if (!hasAccess) {
      throw new ItemTemplatesServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return normalizedWorkspaceId;
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

  /** vault_id must be an entity id of a vault in this workspace that the actor can read. */
  private async assertTemplateVault(
    workspaceId: string,
    userId: string,
    vaultIdRaw: unknown,
  ): Promise<string> {
    const vaultId = typeof vaultIdRaw === "string" ? vaultIdRaw.trim() : "";
    if (!isEntityId(vaultId)) {
      throw new ItemTemplatesServiceError("INVALID_VAULT_ID", 400, "vault id is required");
    }
    const vault = await this.vaults.findById(vaultId);
    if (!vault || vault.workspaceId !== workspaceId) {
      throw new ItemTemplatesServiceError("INVALID_VAULT_ID", 400, "vault not found in workspace");
    }
    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new ItemTemplatesServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return vaultId;
  }
}

/** Empty / omitted favicon clears the field; non-empty values must be entity ids. */
function normalizeOptionalFaviconId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!isEntityId(trimmed)) {
    throw new ItemTemplatesServiceError("INVALID_FAVICON_ID", 400, "favicon id is invalid");
  }
  return trimmed;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof UniqueConstraintError) {
    return true;
  }
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && (error as { code?: string }).code === "23505") {
    return true;
  }
  if ("details" in error) {
    return isUniqueConstraintError((error as { details: unknown }).details);
  }
  if ("cause" in error) {
    return isUniqueConstraintError((error as { cause: unknown }).cause);
  }
  return false;
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

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeSelectOptions(value: unknown): Array<{ value: string; label: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const options: Array<{ value: string; label: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const option = entry as Record<string, unknown>;
    if (typeof option.value !== "string" || typeof option.label !== "string") {
      continue;
    }
    options.push({ value: option.value, label: option.label });
  }
  return options;
}

/**
 * Keep only known structural section/field keys with expected value types;
 * force empty field values. Unknown keys and wrong-typed values are dropped.
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
    const id = asNonEmptyString(src.id);
    if (id === undefined) {
      continue;
    }
    const next: Record<string, unknown> = { id };
    const variant = asNonEmptyString(src.variant);
    if (variant !== undefined && SECTION_VARIANTS.has(variant)) {
      next.variant = variant;
    }
    const title = asNonEmptyString(src.title);
    if (title !== undefined) {
      next.title = title;
    }
    const fields = Array.isArray(src.fields) ? src.fields : [];
    next.fields = fields.flatMap((field) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) {
        return [];
      }
      const fieldSrc = field as Record<string, unknown>;
      const fieldId = asNonEmptyString(fieldSrc.id);
      const type = asNonEmptyString(fieldSrc.type);
      const label = asNonEmptyString(fieldSrc.label);
      if (fieldId === undefined || type === undefined || label === undefined) {
        return [];
      }
      const fieldOut: Record<string, unknown> = {
        id: fieldId,
        type,
        label,
        value: "",
      };
      const editableLabel = asBoolean(fieldSrc.editableLabel);
      if (editableLabel !== undefined) fieldOut.editableLabel = editableLabel;
      const secret = asBoolean(fieldSrc.secret);
      if (secret !== undefined) fieldOut.secret = secret;
      const secretKind = asNonEmptyString(fieldSrc.secretKind);
      if (secretKind !== undefined && SECRET_KINDS.has(secretKind)) {
        fieldOut.secretKind = secretKind;
      }
      const deletable = asBoolean(fieldSrc.deletable);
      if (deletable !== undefined) fieldOut.deletable = deletable;
      const required = asBoolean(fieldSrc.required);
      if (required !== undefined) fieldOut.required = required;
      const urlAutofillScope = asNonEmptyString(fieldSrc.urlAutofillScope);
      if (urlAutofillScope !== undefined && URL_AUTOFILL_SCOPES.has(urlAutofillScope)) {
        fieldOut.urlAutofillScope = urlAutofillScope;
      }
      const disableClickCopy = asBoolean(fieldSrc.disableClickCopy);
      if (disableClickCopy !== undefined) fieldOut.disableClickCopy = disableClickCopy;
      const selectOptions = normalizeSelectOptions(fieldSrc.selectOptions);
      if (selectOptions !== undefined) {
        fieldOut.selectOptions = selectOptions;
      }
      return [fieldOut];
    });
    result.push(next);
  }
  return result;
}

function normalizeTemplatePayload(raw: ItemTemplatePayload, vaultId: string): Record<string, unknown> {
  return {
    record_name: "",
    vault_id: vaultId,
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
