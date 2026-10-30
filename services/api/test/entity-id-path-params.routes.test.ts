import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import type { SessionService } from "../src/session/service.ts";
import type { VaultService } from "../src/vault/service.ts";
import type { SyncService } from "../src/sync/service.ts";
import type { CapsuleService } from "../src/capsule/service.ts";
import type { AttachmentService } from "../src/attachments/service.ts";
import type { VaultSharingService } from "../src/vault-sharing/service.ts";
import type { WorkspaceBuiltInRolesService } from "../src/workspace-roles/list-service.ts";
import type { DeviceService } from "../src/device/service.ts";
import type { AccountRecoveryService } from "../src/account-recovery/service.ts";
import type { WorkspaceMembersService } from "../src/workspace-members/service.ts";
import type { ItemTemplatesService } from "../src/item-templates/service.ts";
import type { WebAuthnService } from "../src/webauthn/service.ts";

/** Postgres bigint / signed int64 max + 1 (out of range for entity ids). */
const OVERSIZED_ID = ((1n << 63n)).toString();

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  end(chunk?: string | Buffer): void {
    if (chunk) {
      this.body += typeof chunk === "string" ? chunk : chunk.toString();
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

function createSessionServiceStub(): SessionService {
  return {
    async resolveAccessToken(token: string) {
      return token.trim() === "test-access-token" ? { userId: "1000000000000000009" } : null;
    },
  } as unknown as SessionService;
}

const OUT_OF_RANGE_ID = "12345678901234567890";
const NON_NUMERIC_ID = "not-an-id";

const config: ApiConfig = createTestApiConfig();

type DispatchInput = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

async function dispatch(input: DispatchInput) {
  let vaultServiceHit = false;
  let syncServiceHit = false;
  let capsuleServiceHit = false;
  let attachmentServiceHit = false;
  let sharingServiceHit = false;
  let rolesServiceHit = false;
  let deviceServiceHit = false;
  let recoveryServiceHit = false;
  let membersServiceHit = false;
  let templatesServiceHit = false;
  let webauthnServiceHit = false;

  const vaultService = {
    listWorkspaceVaults: async () => {
      vaultServiceHit = true;
      return [];
    },
    getVault: async () => {
      vaultServiceHit = true;
      throw new Error("should not hit DB");
    },
    updateVault: async () => {
      vaultServiceHit = true;
      throw new Error("should not hit DB");
    },
    deleteVault: async () => {
      vaultServiceHit = true;
      throw new Error("should not hit DB");
    },
    listAccessibleWorkspaces: async () => [],
  } as unknown as VaultService;

  const syncService = {
    listEvents: async () => {
      syncServiceHit = true;
      throw new Error("should not hit DB");
    },
    appendEvent: async () => {
      syncServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as SyncService;

  const capsuleService = {
    createCapsule: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    getOwnerCapsule: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    updateCapsule: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    deleteCapsule: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    setCapsuleState: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    listOwnerCapsules: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    getCapsuleMetadata: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    openCapsule: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    resolveApproval: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
    getApprovalStatus: async () => {
      capsuleServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as CapsuleService;

  const attachmentService = {
    upload: async () => {
      attachmentServiceHit = true;
      throw new Error("should not hit DB");
    },
    download: async () => {
      attachmentServiceHit = true;
      throw new Error("should not hit DB");
    },
    delete: async () => {
      attachmentServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as AttachmentService;

  const vaultSharingService = {
    getUserVaultKey: async () => {
      sharingServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as VaultSharingService;

  const workspaceBuiltInRolesService = {
    list: async () => {
      rolesServiceHit = true;
      throw new Error("should not hit DB");
    },
    deleteCustomRole: async () => {
      rolesServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as WorkspaceBuiltInRolesService;

  const deviceService = {
    patchDevice: async () => {
      deviceServiceHit = true;
      throw new Error("should not hit DB");
    },
    revokeDevice: async () => {
      deviceServiceHit = true;
      throw new Error("should not hit DB");
    },
    approveDevice: async () => {
      deviceServiceHit = true;
      throw new Error("should not hit DB");
    },
    rejectDevice: async () => {
      deviceServiceHit = true;
      throw new Error("should not hit DB");
    },
    blockDevice: async () => {
      deviceServiceHit = true;
      throw new Error("should not hit DB");
    },
    unblockDevice: async () => {
      deviceServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as DeviceService;

  const accountRecoveryService = {
    removeContact: async () => {
      recoveryServiceHit = true;
      throw new Error("should not hit DB");
    },
    acceptInvite: async () => {
      recoveryServiceHit = true;
      throw new Error("should not hit DB");
    },
    rejectInvite: async () => {
      recoveryServiceHit = true;
      throw new Error("should not hit DB");
    },
    leaveAsContact: async () => {
      recoveryServiceHit = true;
      throw new Error("should not hit DB");
    },
    hasExportedRecoveryKey: async () => true,
    getStatus: async () => ({ enrolled: true }),
  } as unknown as AccountRecoveryService;

  const workspaceMembersService = {
    listMembers: async () => {
      membersServiceHit = true;
      throw new Error("should not hit DB");
    },
    listMemberDirectory: async () => {
      membersServiceHit = true;
      throw new Error("should not hit DB");
    },
    revokeInvitation: async () => {
      membersServiceHit = true;
      throw new Error("should not hit DB");
    },
    removeMember: async () => {
      membersServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as WorkspaceMembersService;

  const itemTemplatesService = {
    list: async () => {
      templatesServiceHit = true;
      throw new Error("should not hit DB");
    },
    create: async () => {
      templatesServiceHit = true;
      throw new Error("should not hit DB");
    },
    update: async () => {
      templatesServiceHit = true;
      throw new Error("should not hit DB");
    },
    delete: async () => {
      templatesServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as ItemTemplatesService;

  const webauthnService = {
    deleteCredential: async () => {
      webauthnServiceHit = true;
      throw new Error("should not hit DB");
    },
  } as unknown as WebAuthnService;

  const app = createApiApp(config, loggerStub(), {
    sessionService: createSessionServiceStub(),
    vaultService,
    syncService,
    capsuleService,
    attachmentService,
    vaultSharingService,
    workspaceBuiltInRolesService,
    deviceService,
    accountRecoveryService,
    workspaceMembersService,
    itemTemplatesService,
    webauthnService,
  });

  const req = {
    method: input.method,
    url: input.url,
    headers: {
      authorization: "Bearer test-access-token",
      ...(input.headers ?? {}),
    },
    body: input.body,
  } as IncomingMessage & { body?: string };
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);

  return {
    res,
    hits: {
      vaultServiceHit,
      syncServiceHit,
      capsuleServiceHit,
      attachmentServiceHit,
      sharingServiceHit,
      rolesServiceHit,
      deviceServiceHit,
      recoveryServiceHit,
      membersServiceHit,
      templatesServiceHit,
      webauthnServiceHit,
    },
  };
}

function assertInvalidEntityId(
  res: MockResponse,
  expectedError: string,
  hits: Record<string, boolean>,
): void {
  assert.equal(res.statusCode, 400, res.body);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, expectedError);
  for (const [name, hit] of Object.entries(hits)) {
    assert.equal(hit, false, `${name} should not run for invalid entity id`);
  }
}

const CASES: Array<{
  name: string;
  method: string;
  url: string;
  error: string;
  body?: string;
  headers?: Record<string, string>;
}> = [
  {
    name: "vault get non-numeric",
    method: "GET",
    url: `/vaults/${NON_NUMERIC_ID}`,
    error: "INVALID_VAULT_ID",
  },
  {
    name: "vault get out-of-range",
    method: "GET",
    url: `/vaults/${OUT_OF_RANGE_ID}`,
    error: "INVALID_VAULT_ID",
  },
  {
    name: "vault get int64 overflow",
    method: "GET",
    url: `/vaults/${OVERSIZED_ID}`,
    error: "INVALID_VAULT_ID",
  },
  {
    name: "workspace vaults list",
    method: "GET",
    url: `/workspaces/${NON_NUMERIC_ID}/vaults`,
    error: "INVALID_WORKSPACE_ID",
  },
  {
    name: "sync events list",
    method: "GET",
    url: `/vaults/${OUT_OF_RANGE_ID}/events`,
    error: "INVALID_VAULT_ID",
  },
  {
    name: "sync events append",
    method: "POST",
    url: `/vaults/${NON_NUMERIC_ID}/events`,
    error: "INVALID_VAULT_ID",
    body: JSON.stringify({
      eventType: "ITEM_CREATE",
      encryptedBlob: { crypto_version: 2, algorithm: "opaque", payload: "YQ==", meta: {} },
      baseVersion: 0,
    }),
  },
  {
    name: "shared vault key",
    method: "GET",
    url: `/vaults/${OUT_OF_RANGE_ID}/key`,
    error: "INVALID_VAULT_ID",
  },
  {
    name: "attachment upload",
    method: "POST",
    url: `/vaults/${NON_NUMERIC_ID}/items/1000000000000000002/attachments`,
    error: "INVALID_VAULT_ID",
    headers: {
      "x-encrypted-key": Buffer.from([1]).toString("base64"),
      "x-file-name": "a.bin",
    },
  },
  {
    name: "attachment download",
    method: "GET",
    url: `/vaults/1000000000000000001/items/${OUT_OF_RANGE_ID}/attachments/1000000000000000003`,
    error: "INVALID_ITEM_ID",
  },
  {
    name: "attachment delete",
    method: "DELETE",
    url: `/vaults/1000000000000000001/items/1000000000000000002/attachments/${NON_NUMERIC_ID}`,
    error: "INVALID_ATTACHMENT_ID",
  },
  {
    name: "capsule create",
    method: "POST",
    url: `/workspaces/${OUT_OF_RANGE_ID}/capsules`,
    error: "INVALID_WORKSPACE_ID",
    body: JSON.stringify({
      type: "item",
      encryptedPayload: { crypto_version: 2, algorithm: "opaque", payload: "YQ==", meta: {} },
    }),
  },
  {
    name: "capsule metadata",
    method: "GET",
    url: `/capsules/${NON_NUMERIC_ID}`,
    error: "INVALID_CAPSULE_ID",
  },
  {
    name: "capsule owner detail",
    method: "GET",
    url: `/capsules/${OUT_OF_RANGE_ID}/owner`,
    error: "INVALID_CAPSULE_ID",
  },

  {
    name: "roles list",
    method: "GET",
    url: `/workspaces/${NON_NUMERIC_ID}/roles`,
    error: "INVALID_WORKSPACE_ID",
  },
  {
    name: "role delete",
    method: "DELETE",
    url: `/workspaces/1000000000000000001/roles/${OUT_OF_RANGE_ID}`,
    error: "INVALID_ROLE_ID",
  },
  {
    name: "device revoke",
    method: "POST",
    url: `/devices/${NON_NUMERIC_ID}/revoke`,
    error: "INVALID_DEVICE_ID",
  },
  {
    name: "recovery contact delete",
    method: "DELETE",
    url: `/account/recovery/contacts/${OUT_OF_RANGE_ID}`,
    error: "INVALID_CONTACT_ID",
  },
  {
    name: "members list",
    method: "GET",
    url: `/workspaces/${NON_NUMERIC_ID}/members`,
    error: "INVALID_WORKSPACE_ID",
  },
  {
    name: "member delete",
    method: "DELETE",
    url: `/workspaces/1000000000000000001/members/${OUT_OF_RANGE_ID}`,
    error: "INVALID_USER_ID",
  },
  {
    name: "invitation delete",
    method: "DELETE",
    url: `/workspaces/1000000000000000001/invitations/${NON_NUMERIC_ID}`,
    error: "INVALID_INVITATION_ID",
  },
  {
    name: "item template update path",
    method: "PATCH",
    url: `/workspaces/1000000000000000001/item-templates/${OUT_OF_RANGE_ID}`,
    error: "INVALID_TEMPLATE_ID",
    body: JSON.stringify({
      name: "x",
      category_id: "login",
      payload: { vault_id: "1000000000000000001", sections: [] },
    }),
  },
];

for (const testCase of CASES) {
  test(`invalid entity id → 400 without service hit: ${testCase.name}`, async () => {
    const { res, hits } = await dispatch({
      method: testCase.method,
      url: testCase.url,
      body: testCase.body,
      headers: testCase.headers,
    });
    assertInvalidEntityId(res, testCase.error, hits);
  });
}

test("invalid percent-encoding in path returns 400 and does not throw", async () => {
  const { res, hits } = await dispatch({
    method: "GET",
    url: "/vaults/%ZZ",
  });
  assert.equal(res.statusCode, 400, res.body);
  const payload = JSON.parse(res.body) as { error: string; message: string };
  assert.equal(payload.error, "BAD_REQUEST");
  assert.match(payload.message, /encoding/i);
  for (const hit of Object.values(hits)) {
    assert.equal(hit, false);
  }
});

test("webauthn credential row id is validated as entity id", async () => {
  const { res, hits } = await dispatch({
    method: "DELETE",
    url: `/account/webauthn/credentials/${OUT_OF_RANGE_ID}`,
  });
  assertInvalidEntityId(res, "INVALID_CREDENTIAL_ID", hits);
});
