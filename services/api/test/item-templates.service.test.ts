import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ItemTemplatesService,
  ItemTemplatesServiceError,
  stripTemplateSectionValues,
} from "../src/item-templates/service.ts";

function workspacesStub(options?: { isOwnerOrAdmin?: boolean }) {
  return {
    findById: async () => ({ id: "ws-1", ownerId: "owner-1" }),
    hasAccess: async () => true,
    isOwnerOrAdmin: async () => options?.isOwnerOrAdmin ?? false,
  };
}

function vaultsStub(options?: { readableVaultIds?: string[] }) {
  const readable = new Set(options?.readableVaultIds ?? ["1000000000000000002", "vault-1"]);
  return {
    canReadVault: async (vaultId: string) => readable.has(vaultId),
  };
}

test("stripTemplateSectionValues allowlists structural keys and clears values", () => {
  const stripped = stripTemplateSectionValues([
    {
      id: "login",
      variant: "primary",
      title: "Login",
      note: "should-drop",
      fields: [
        {
          id: "password",
          type: "password",
          label: "Password",
          value: "s3cret",
          copyValue: "s3cret",
          secret: true,
          defaultValue: "nope",
          history: ["a"],
        },
        { id: "note", type: "text", label: "Note", value: "hello", note: "drop-me" },
      ],
    },
  ]);

  assert.deepEqual(stripped, [
    {
      id: "login",
      variant: "primary",
      title: "Login",
      fields: [
        { id: "password", type: "password", label: "Password", value: "", secret: true },
        { id: "note", type: "text", label: "Note", value: "" },
      ],
    },
  ]);
});

test("ItemTemplatesService.create rejects empty template name", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      create: async () => {
        throw new Error("should not be called");
      },
    } as never,
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
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
    } as never,
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
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

test("ItemTemplatesService.create stores structure-only payload", async () => {
  let storedPayload: Record<string, unknown> | null = null;
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
        storedPayload = input.payloadJson;
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
    } as never,
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
  });

  const template = await service.create("ws-1", "user-1", {
    id: "1000000000000000001",
    name: "My template",
    category_id: "login",
    payload: {
      record_name: "Title",
      vault_id: "1000000000000000002",
      folder_id: "__none__",
      sections: [
        {
          id: "primary",
          fields: [
            {
              id: "password",
              type: "password",
              label: "Password",
              value: "s3cret",
              copyValue: "s3cret",
            },
          ],
        },
      ],
      tags: ["work"],
    },
    favicon_id: "1000000000000000003",
  });

  assert.equal(template.id, "1000000000000000001");
  assert.equal(template.favicon_id, "1000000000000000003");
  assert.equal(template.payload.record_name, "");
  assert.deepEqual(template.payload.tags, []);
  assert.deepEqual(template.payload.sections, [
    {
      id: "primary",
      fields: [{ id: "password", type: "password", label: "Password", value: "" }],
    },
  ]);
  assert.ok(storedPayload);
  assert.equal(storedPayload.record_name, "");
  assert.deepEqual(storedPayload.tags, []);
});

test("ItemTemplatesService.list strips legacy field values from responses", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [
        {
          id: "1000000000000000001",
          workspaceId: "ws-1",
          name: "Legacy",
          categoryId: "login",
          payloadJson: {
            record_name: "Old title",
            vault_id: "1000000000000000002",
            folder_id: "__none__",
            sections: [
              {
                fields: [{ type: "password", value: "legacy-secret", copyValue: "legacy-secret" }],
              },
            ],
            tags: ["x"],
          },
          faviconId: null,
          createdBy: "user-1",
          createdAt: "",
          updatedAt: "",
        },
      ],
      create: async () => {
        throw new Error("should not be called");
      },
    } as never,
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
  });

  const [template] = await service.list("ws-1", "user-2");
  assert.equal(template.payload.record_name, "");
  assert.deepEqual(template.payload.tags, []);
  assert.deepEqual(template.payload.sections, [
    {
      fields: [{ type: "password", value: "" }],
    },
  ]);
});

test("ItemTemplatesService.list returns only templates for vaults the member can read", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [
        {
          id: "1000000000000000001",
          workspaceId: "ws-1",
          name: "Readable vault template",
          categoryId: "login",
          payloadJson: {
            vault_id: "1000000000000000002",
            folder_id: "__none__",
            sections: [{ id: "primary", fields: [{ id: "login", type: "text", label: "Login", value: "" }] }],
            tags: [],
          },
          faviconId: null,
          createdBy: "user-1",
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "1000000000000000003",
          workspaceId: "ws-1",
          name: "Hidden vault template",
          categoryId: "login",
          payloadJson: {
            vault_id: "1000000000000000099",
            folder_id: "__none__",
            sections: [{ id: "primary", fields: [{ id: "login", type: "text", label: "Secret layout", value: "" }] }],
            tags: [],
          },
          faviconId: null,
          createdBy: "user-1",
          createdAt: "",
          updatedAt: "",
        },
      ],
      create: async () => {
        throw new Error("should not be called");
      },
    } as never,
    workspaces: workspacesStub(),
    vaults: vaultsStub({ readableVaultIds: ["1000000000000000002"] }),
  });

  const templates = await service.list("ws-1", "user-2");
  assert.equal(templates.length, 1);
  assert.equal(templates[0]?.id, "1000000000000000001");
  assert.equal(templates[0]?.name, "Readable vault template");
});

test("ItemTemplatesService.update rejects missing template", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      findById: async () => null,
      create: async () => {
        throw new Error("should not be called");
      },
      update: async () => null,
      delete: async () => false,
    },
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
  });

  await assert.rejects(
    () =>
      service.update("ws-1", "user-1", "missing-template", {
        name: "Updated",
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
      assert.equal(error.code, "TEMPLATE_NOT_FOUND");
      return true;
    },
  );
});

test("ItemTemplatesService.update persists template changes for creator", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      findById: async () => ({
        id: "1000000000000000001",
        workspaceId: "ws-1",
        name: "Old name",
        categoryId: "login",
        payloadJson: {
          record_name: "Title",
          vault_id: "1000000000000000002",
          folder_id: "__none__",
          sections: [],
          tags: [],
        },
        faviconId: "1000000000000000003",
        createdBy: "user-1",
        createdAt: "",
        updatedAt: "",
      }),
      create: async () => {
        throw new Error("should not be called");
      },
      update: async (input: {
        workspaceId: string;
        templateId: string;
        name: string;
        categoryId: string;
        payloadJson: Record<string, unknown>;
        faviconId?: string | null;
      }) => {
        assert.equal(input.templateId, "1000000000000000001");
        assert.equal(input.name, "Updated name");
        assert.deepEqual(input.payloadJson.tags, []);
        assert.equal(input.payloadJson.record_name, "");
        return {
          id: input.templateId,
          workspaceId: input.workspaceId,
          name: input.name,
          categoryId: input.categoryId,
          payloadJson: input.payloadJson,
          faviconId: input.faviconId ?? null,
          createdBy: "user-1",
          createdAt: "",
          updatedAt: "",
        };
      },
      delete: async () => false,
    },
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
  });

  const template = await service.update("ws-1", "user-1", "1000000000000000001", {
    name: "Updated name",
    category_id: "login",
    payload: {
      record_name: "Title",
      vault_id: "1000000000000000002",
      folder_id: "__none__",
      sections: [],
      tags: ["work"],
    },
    favicon_id: "1000000000000000003",
  });

  assert.equal(template.name, "Updated name");
  assert.deepEqual(template.payload.tags, []);
});

test("ItemTemplatesService.update rejects non-creator non-admin member", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      findById: async () => ({
        id: "1000000000000000001",
        workspaceId: "ws-1",
        name: "Owned by other",
        categoryId: "login",
        payloadJson: {
          record_name: "",
          vault_id: "1000000000000000002",
          folder_id: "__none__",
          sections: [],
          tags: [],
        },
        faviconId: null,
        createdBy: "user-owner",
        createdAt: "",
        updatedAt: "",
      }),
      create: async () => {
        throw new Error("should not be called");
      },
      update: async () => {
        throw new Error("should not be called");
      },
      delete: async () => false,
    },
    workspaces: workspacesStub({ isOwnerOrAdmin: false }),
    vaults: vaultsStub(),
  });

  await assert.rejects(
    () =>
      service.update("ws-1", "user-other", "1000000000000000001", {
        name: "Hijacked",
        category_id: "login",
        payload: {
          record_name: "",
          vault_id: "1000000000000000002",
          folder_id: "__none__",
          sections: [],
          tags: [],
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ItemTemplatesServiceError);
      assert.equal(error.code, "ACCESS_DENIED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

test("ItemTemplatesService.update allows workspace admin for another member template", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      findById: async () => ({
        id: "1000000000000000001",
        workspaceId: "ws-1",
        name: "Owned by other",
        categoryId: "login",
        payloadJson: {
          record_name: "",
          vault_id: "1000000000000000002",
          folder_id: "__none__",
          sections: [],
          tags: [],
        },
        faviconId: null,
        createdBy: "user-owner",
        createdAt: "",
        updatedAt: "",
      }),
      create: async () => {
        throw new Error("should not be called");
      },
      update: async (input: {
        workspaceId: string;
        templateId: string;
        name: string;
        categoryId: string;
        payloadJson: Record<string, unknown>;
        faviconId?: string | null;
      }) => ({
        id: input.templateId,
        workspaceId: input.workspaceId,
        name: input.name,
        categoryId: input.categoryId,
        payloadJson: input.payloadJson,
        faviconId: input.faviconId ?? null,
        createdBy: "user-owner",
        createdAt: "",
        updatedAt: "",
      }),
      delete: async () => false,
    },
    workspaces: workspacesStub({ isOwnerOrAdmin: true }),
    vaults: vaultsStub(),
  });

  const template = await service.update("ws-1", "admin-1", "1000000000000000001", {
    name: "Admin rename",
    category_id: "login",
    payload: {
      record_name: "",
      vault_id: "1000000000000000002",
      folder_id: "__none__",
      sections: [],
      tags: [],
    },
  });
  assert.equal(template.name, "Admin rename");
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
    } as never,
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
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

test("ItemTemplatesService.delete rejects non-creator non-admin member", async () => {
  const service = new ItemTemplatesService({
    templates: {
      listByWorkspace: async () => [],
      findById: async () => ({
        id: "1000000000000000001",
        workspaceId: "ws-1",
        name: "Template",
        categoryId: "login",
        payloadJson: { sections: [] },
        faviconId: null,
        createdBy: "user-owner",
        createdAt: "",
        updatedAt: "",
      }),
      create: async () => {
        throw new Error("should not be called");
      },
      delete: async () => {
        throw new Error("should not be called");
      },
    } as never,
    workspaces: workspacesStub({ isOwnerOrAdmin: false }),
    vaults: vaultsStub(),
  });

  await assert.rejects(
    () => service.delete("ws-1", "user-other", "1000000000000000001"),
    (error: unknown) => {
      assert.ok(error instanceof ItemTemplatesServiceError);
      assert.equal(error.code, "ACCESS_DENIED");
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
    } as never,
    workspaces: workspacesStub(),
    vaults: vaultsStub(),
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
