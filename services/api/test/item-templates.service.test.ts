import assert from "node:assert/strict";
import { test } from "node:test";

import { ItemTemplatesService, ItemTemplatesServiceError } from "../src/item-templates/service.ts";

test("ItemTemplatesService.create rejects empty template name", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      create: async () => {
        throw new Error("should not be called");
      },
    },
    workspaces: {
      findById: async () => ({ id: "ws-1" }),
      hasAccess: async () => true,
    },
  });

  await assert.rejects(
    () =>
      service.create("ws-1", "user-1", {
        id: "1000000000000000001",
        name: "   ",
        category_id: "login",
        payload: {
          record_name: "",
          vault_id: "vault-1",
          folder_id: "__none__",
          sections: [],
          tags: [],
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ItemTemplatesServiceError);
      assert.equal(error.code, "INVALID_TEMPLATE_NAME");
      return true;
    },
  );
});

test("ItemTemplatesService.create rejects unknown category id", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      create: async () => {
        throw new Error("should not be called");
      },
    },
    workspaces: {
      findById: async () => ({ id: "ws-1" }),
      hasAccess: async () => true,
    },
  });

  await assert.rejects(
    () =>
      service.create("ws-1", "user-1", {
        id: "1000000000000000001",
        name: "My template",
        category_id: "unknown",
        payload: {
          record_name: "Title",
          vault_id: "vault-1",
          folder_id: "__none__",
          sections: [],
          tags: ["work"],
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ItemTemplatesServiceError);
      assert.equal(error.code, "INVALID_CATEGORY_ID");
      return true;
    },
  );
});

test("ItemTemplatesService.create uses client-provided template id", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      create: async (input: {
        id: string;
        workspaceId: string;
        name: string;
        categoryId: string;
        payloadJson: Record<string, unknown>;
        faviconId?: string | null;
        createdBy: string;
      }) => {
        assert.equal(input.id, "1000000000000000001");
        return {
          id: input.id,
          workspaceId: input.workspaceId,
          name: input.name,
          categoryId: input.categoryId,
          payloadJson: input.payloadJson,
          faviconId: input.faviconId ?? null,
          createdBy: input.createdBy,
          createdAt: "",
          updatedAt: "",
        };
      },
    },
    workspaces: {
      findById: async () => ({ id: "ws-1" }),
      hasAccess: async () => true,
    },
  });

  const template = await service.create("ws-1", "user-1", {
    id: "1000000000000000001",
    name: "My template",
    category_id: "login",
    payload: {
      record_name: "Title",
      vault_id: "1000000000000000002",
      folder_id: "__none__",
      sections: [],
      tags: [],
    },
    favicon_id: "1000000000000000003",
  });

  assert.equal(template.id, "1000000000000000001");
  assert.equal(template.favicon_id, "1000000000000000003");
});

test("ItemTemplatesService.delete rejects missing template", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      findById: async () => null,
      create: async () => {
        throw new Error("should not be called");
      },
      delete: async () => false,
    },
    workspaces: {
      findById: async () => ({ id: "ws-1" }),
      hasAccess: async () => true,
    },
  });

  await assert.rejects(
    () => service.delete("ws-1", "user-1", "missing-template"),
    (error: unknown) => {
      assert.ok(error instanceof ItemTemplatesServiceError);
      assert.equal(error.code, "TEMPLATE_NOT_FOUND");
      return true;
    },
  );
});

test("ItemTemplatesService.delete purges template attachments by template id", async () => {
  let purgedTemplateId = "";
  let purgedAttachmentIds: string[] = [];
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      findById: async () => ({
        id: "1000000000000000001",
        workspaceId: "ws-1",
        name: "Template",
        categoryId: "login",
        payloadJson: {
          vault_id: "1000000000000000002",
          sections: [
            {
              fields: [
                {
                  type: "file",
                  value: JSON.stringify({
                    attachmentId: "1000000000000000004",
                    name: "doc.pdf",
                    mimeType: "application/pdf",
                    sizeBytes: 10,
                  }),
                },
              ],
            },
          ],
        },
        faviconId: "1000000000000000003",
        createdBy: "user-1",
        createdAt: "",
        updatedAt: "",
      }),
      create: async () => {
        throw new Error("should not be called");
      },
      delete: async () => true,
    },
    workspaces: {
      findById: async () => ({ id: "ws-1" }),
      hasAccess: async () => true,
    },
    attachments: {
      async purgeForTemplate(templateId: string, referencedAttachmentIds: Iterable<string>) {
        purgedTemplateId = templateId;
        purgedAttachmentIds = [...referencedAttachmentIds];
      },
    },
  });

  await service.delete("ws-1", "user-1", "1000000000000000001");

  assert.equal(purgedTemplateId, "1000000000000000001");
  assert.deepEqual(purgedAttachmentIds, ["1000000000000000003", "1000000000000000004"]);
});
