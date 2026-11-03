import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceProfileRecord } from "../src/storage/workspace-profiles.ts";
import type { WorkspaceRoleRecord } from "../src/storage/workspace-roles.ts";
import { WorkspaceMembersService } from "../src/workspace-members/service.ts";
import {
  WorkspaceBuiltInProfilesService,
  type WorkspaceBuiltInProfilesServiceDeps,
  type WorkspaceProfilesRepositoryLike,
} from "../src/workspace-profiles/list-service.ts";
import {
  WorkspaceBuiltInRolesService,
  type WorkspaceBuiltInRolesServiceDeps,
  type WorkspaceRolesRepositoryLike,
} from "../src/workspace-roles/list-service.ts";

const WORKSPACE_ID = "1000000000000000001";
const OWNER_ID = "2000000000000000001";
const ADMIN_ID = "2000000000000000002";
const USER_ID = "2000000000000000003";
const USER_ROLE_ID = "3000000000000000003";
const CUSTOM_ROLE_ID = "3000000000000000010";
const CUSTOM_PROFILE_ID = "4000000000000000010";

type QueryCall = { sql: string; params: unknown[] };
type QueryHandler = (sql: string, params: unknown[]) => unknown[] | undefined;

function emptyCell() {
  return { get: 0, post: 0, put: 0, delete: 0 };
}

function permissionsJson(overrides: Record<string, Record<string, number>> = {}) {
  const resources = ["settings", "settings_items", "settings_capsules", "roles", "profiles", "members", "vaults", "billing"];
  return Object.fromEntries(resources.map((resource) => [resource, overrides[resource] ?? emptyCell()]));
}

/** Answers only the queries issued by seeding + permission resolution; tests add handlers for the rest. */
function createFakeDb(
  actorPermissions: Record<string, Record<string, Record<string, number>>>,
  handlers: QueryHandler[] = [],
) {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      calls.push({ sql, params });
      for (const handler of handlers) {
        const result = handler(sql, params);
        if (result) {
          return result as T[];
        }
      }
      if (/SELECT owner_id FROM workspaces/.test(sql)) {
        return [{ owner_id: OWNER_ID }] as T[];
      }
      if (/SELECT r\.permissions_json/.test(sql)) {
        const actorId = String(params[1]);
        const raw = actorPermissions[actorId];
        return (raw ? [{ permissions_json: raw }] : []) as T[];
      }
      if (/SELECT id\s+FROM (roles|profiles)\s+WHERE workspace_id = \$1\s+AND builtin_key = \$2/.test(sql)) {
        return [{ id: `seed-${String(params[1])}` }] as T[];
      }
      if (/SELECT id\s+FROM workspace_members\s+WHERE workspace_id = \$1\s+AND user_id = \$2/.test(sql)) {
        return [{ id: "seed-member" }] as T[];
      }
      return [];
    },
  };
}

function createWorkspaces() {
  return {
    async findById(id: string) {
      return id === WORKSPACE_ID ? { id, ownerId: OWNER_ID } : null;
    },
    async hasAccess(workspaceId: string, userId: string) {
      return workspaceId === WORKSPACE_ID && [OWNER_ID, ADMIN_ID, USER_ID].includes(userId);
    },
  } as unknown as WorkspaceBuiltInRolesServiceDeps["workspaces"];
}

function roleRecord(overrides: Partial<WorkspaceRoleRecord>): WorkspaceRoleRecord {
  return {
    id: "3000000000000000001",
    workspaceId: WORKSPACE_ID,
    name: "Role",
    description: "",
    permissionsJson: {},
    isSystem: true,
    builtinKey: null,
    memberCount: 0,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function profileRecord(overrides: Partial<WorkspaceProfileRecord>): WorkspaceProfileRecord {
  return {
    id: "4000000000000000001",
    workspaceId: WORKSPACE_ID,
    name: "Profile",
    description: "",
    permissionsJson: {},
    isSystem: true,
    builtinKey: null,
    applicationCount: 0,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createRolesRepo(records: WorkspaceRoleRecord[]) {
  const events: string[] = [];
  const repo: WorkspaceRolesRepositoryLike = {
    async listByWorkspace() {
      return records;
    },
    async findById(_workspaceId, roleId) {
      return records.find((record) => record.id === roleId) ?? null;
    },
    async findByBuiltinKey(_workspaceId, builtinKey) {
      return records.find((record) => record.builtinKey === builtinKey) ?? null;
    },
    async reassignMembersToRole(_workspaceId, fromRoleId, toRoleId) {
      events.push(`members:${fromRoleId}->${toRoleId}`);
      return 1;
    },
    async reassignInvitationsToRole(_workspaceId, fromRoleId, toRoleId) {
      events.push(`invitations:${fromRoleId}->${toRoleId}`);
      return 1;
    },
    async deleteCustom(_workspaceId, roleId) {
      events.push(`delete:${roleId}`);
      return records.some((record) => record.id === roleId && !record.isSystem);
    },
  };
  return { repo, events };
}

function createProfilesRepo(records: WorkspaceProfileRecord[]) {
  const events: string[] = [];
  const repo: WorkspaceProfilesRepositoryLike = {
    async listByWorkspace() {
      return records;
    },
    async findById(_workspaceId, profileId) {
      return records.find((record) => record.id === profileId) ?? null;
    },
    async deleteCustom(_workspaceId, profileId) {
      events.push(`delete:${profileId}`);
      return records.some((record) => record.id === profileId && !record.isSystem);
    },
  };
  return { repo, events };
}

const ROLE_RECORDS: WorkspaceRoleRecord[] = [
  roleRecord({ id: "3000000000000000001", builtinKey: "owner", name: "Owner", memberCount: 1 }),
  roleRecord({ id: "3000000000000000002", builtinKey: "admin", name: "Admin" }),
  roleRecord({ id: USER_ROLE_ID, builtinKey: "user", name: "User" }),
  roleRecord({ id: CUSTOM_ROLE_ID, isSystem: false, name: "Auditors", memberCount: 2, createdBy: ADMIN_ID }),
  roleRecord({ id: "3000000000000000011", isSystem: false, name: "Owner-made", createdBy: OWNER_ID }),
];

test("roles list maps built-in roles and custom remnants for full-access actor", async () => {
  const { repo } = createRolesRepo(ROLE_RECORDS);
  const service = new WorkspaceBuiltInRolesService({
    roles: repo,
    workspaces: createWorkspaces(),
    db: createFakeDb({}),
  });

  const roles = await service.list(WORKSPACE_ID, OWNER_ID);
  assert.deepEqual(
    roles.map((role) => [role.kind, role.name]),
    [
      ["builtin", "Owner"],
      ["builtin", "Admin"],
      ["builtin", "User"],
      ["custom", "Auditors"],
      ["custom", "Owner-made"],
    ],
  );
  assert.deepEqual(roles[3], {
    id: CUSTOM_ROLE_ID,
    kind: "custom",
    name: "Auditors",
    description: "",
    member_count: 2,
    created_by: ADMIN_ID,
  });
});

test("roles list hides custom remnants without roles.get and filters own-only", async () => {
  const { repo } = createRolesRepo(ROLE_RECORDS);
  const service = new WorkspaceBuiltInRolesService({
    roles: repo,
    workspaces: createWorkspaces(),
    db: createFakeDb({
      [USER_ID]: permissionsJson(),
      [ADMIN_ID]: permissionsJson({ roles: { get: 2, post: 0, put: 0, delete: 2 } }),
    }),
  });

  const userRoles = await service.list(WORKSPACE_ID, USER_ID);
  assert.deepEqual(userRoles.map((role) => role.kind), ["builtin", "builtin", "builtin"]);

  const adminRoles = await service.list(WORKSPACE_ID, ADMIN_ID);
  assert.deepEqual(
    adminRoles.filter((role) => role.kind === "custom").map((role) => role.id),
    [CUSTOM_ROLE_ID],
  );
});

test("deleteCustomRole reassigns members and invitations to the built-in user role", async () => {
  const { repo, events } = createRolesRepo(ROLE_RECORDS);
  const service = new WorkspaceBuiltInRolesService({
    roles: repo,
    workspaces: createWorkspaces(),
    db: createFakeDb({}),
  });

  await service.deleteCustomRole(WORKSPACE_ID, OWNER_ID, CUSTOM_ROLE_ID);
  assert.deepEqual(events, [
    `members:${CUSTOM_ROLE_ID}->${USER_ROLE_ID}`,
    `invitations:${CUSTOM_ROLE_ID}->${USER_ROLE_ID}`,
    `delete:${CUSTOM_ROLE_ID}`,
  ]);
});

test("deleteCustomRole rejects system roles, unknown roles, and actors without delete", async () => {
  const { repo, events } = createRolesRepo(ROLE_RECORDS);
  const service = new WorkspaceBuiltInRolesService({
    roles: repo,
    workspaces: createWorkspaces(),
    db: createFakeDb({
      [USER_ID]: permissionsJson(),
      [ADMIN_ID]: permissionsJson({ roles: { get: 2, post: 0, put: 0, delete: 2 } }),
    }),
  });

  await assert.rejects(service.deleteCustomRole(WORKSPACE_ID, OWNER_ID, USER_ROLE_ID), {
    code: "ROLE_NOT_MUTABLE",
    statusCode: 403,
  });
  await assert.rejects(service.deleteCustomRole(WORKSPACE_ID, OWNER_ID, "3000000000000000099"), {
    code: "ROLE_NOT_FOUND",
    statusCode: 404,
  });
  await assert.rejects(service.deleteCustomRole(WORKSPACE_ID, OWNER_ID, "not-an-id"), {
    code: "INVALID_ROLE_ID",
    statusCode: 400,
  });
  await assert.rejects(service.deleteCustomRole(WORKSPACE_ID, USER_ID, CUSTOM_ROLE_ID), {
    code: "ACCESS_DENIED",
    statusCode: 403,
  });
  await assert.rejects(service.deleteCustomRole(WORKSPACE_ID, ADMIN_ID, "3000000000000000011"), {
    code: "ACCESS_DENIED",
    statusCode: 403,
  });
  assert.deepEqual(events, []);

  await service.deleteCustomRole(WORKSPACE_ID, ADMIN_ID, CUSTOM_ROLE_ID);
  assert.equal(events.at(-1), `delete:${CUSTOM_ROLE_ID}`);
});

const PROFILE_RECORDS: WorkspaceProfileRecord[] = [
  profileRecord({ id: "4000000000000000001", builtinKey: "extended", name: "Extended", applicationCount: 3 }),
  profileRecord({ id: "4000000000000000002", builtinKey: "simple", name: "Simple" }),
  profileRecord({ id: CUSTOM_PROFILE_ID, isSystem: false, name: "Read only", applicationCount: 1, createdBy: ADMIN_ID }),
];

test("profiles list maps built-in profiles and custom remnants", async () => {
  const { repo } = createProfilesRepo(PROFILE_RECORDS);
  const service = new WorkspaceBuiltInProfilesService({
    profiles: repo,
    workspaces: createWorkspaces() as unknown as WorkspaceBuiltInProfilesServiceDeps["workspaces"],
    db: createFakeDb({ [USER_ID]: permissionsJson() }),
  });

  const ownerProfiles = await service.list(WORKSPACE_ID, OWNER_ID);
  assert.deepEqual(ownerProfiles.at(-1), {
    id: CUSTOM_PROFILE_ID,
    kind: "custom",
    name: "Read only",
    description: "",
    application_count: 1,
    created_by: ADMIN_ID,
  });

  const userProfiles = await service.list(WORKSPACE_ID, USER_ID);
  assert.deepEqual(userProfiles.map((profile) => profile.kind), ["builtin", "builtin"]);
});

test("deleteCustomProfile deletes custom remnants and guards system profiles and permissions", async () => {
  const { repo, events } = createProfilesRepo(PROFILE_RECORDS);
  const service = new WorkspaceBuiltInProfilesService({
    profiles: repo,
    workspaces: createWorkspaces() as unknown as WorkspaceBuiltInProfilesServiceDeps["workspaces"],
    db: createFakeDb({ [USER_ID]: permissionsJson() }),
  });

  await assert.rejects(service.deleteCustomProfile(WORKSPACE_ID, OWNER_ID, "4000000000000000001"), {
    code: "PROFILE_NOT_MUTABLE",
    statusCode: 403,
  });
  await assert.rejects(service.deleteCustomProfile(WORKSPACE_ID, OWNER_ID, "4000000000000000099"), {
    code: "PROFILE_NOT_FOUND",
    statusCode: 404,
  });
  await assert.rejects(service.deleteCustomProfile(WORKSPACE_ID, USER_ID, CUSTOM_PROFILE_ID), {
    code: "ACCESS_DENIED",
    statusCode: 403,
  });
  assert.deepEqual(events, []);

  await service.deleteCustomProfile(WORKSPACE_ID, OWNER_ID, CUSTOM_PROFILE_ID);
  assert.deepEqual(events, [`delete:${CUSTOM_PROFILE_ID}`]);
});

const INVITATION_ID = "5000000000000000001";

function createMembersService(handlers: QueryHandler[] = []) {
  const db = createFakeDb(
    {
      [USER_ID]: permissionsJson(),
      [ADMIN_ID]: permissionsJson({ members: { get: 1, post: 0, put: 0, delete: 2 } }),
    },
    handlers,
  );
  const service = new WorkspaceMembersService({
    db,
    workspaces: createWorkspaces() as unknown as ConstructorParameters<typeof WorkspaceMembersService>[0]["workspaces"],
  });
  return { db, service };
}

test("removeMember drops vault access and membership for a non-owner member", async () => {
  const { db, service } = createMembersService([
    (sql) =>
      /SELECT id, invited_by_user_id FROM workspace_members/.test(sql)
        ? [{ id: "6000000000000000001", invited_by_user_id: OWNER_ID }]
        : undefined,
  ]);

  await service.removeMember(WORKSPACE_ID, OWNER_ID, USER_ID);
  const deletes = db.calls.filter((call) => /^\s*DELETE FROM/.test(call.sql)).map((call) => call.sql.trim().split(/\s+/)[2]);
  assert.deepEqual(deletes, ["vault_keys", "vault_profiles", "vault_members", "workspace_members"]);
});

test("removeMember guards owner, self, unknown members, and own-only scope", async () => {
  const { service } = createMembersService([
    (sql) =>
      /SELECT id, invited_by_user_id FROM workspace_members/.test(sql)
        ? [{ id: "6000000000000000001", invited_by_user_id: OWNER_ID }]
        : undefined,
  ]);

  await assert.rejects(service.removeMember(WORKSPACE_ID, ADMIN_ID, OWNER_ID), { code: "BAD_REQUEST" });
  await assert.rejects(service.removeMember(WORKSPACE_ID, ADMIN_ID, ADMIN_ID), { code: "BAD_REQUEST" });
  await assert.rejects(service.removeMember(WORKSPACE_ID, ADMIN_ID, USER_ID), {
    code: "ACCESS_DENIED",
    statusCode: 403,
  });

  const { service: emptyService } = createMembersService();
  await assert.rejects(emptyService.removeMember(WORKSPACE_ID, OWNER_ID, USER_ID), {
    code: "NOT_FOUND",
    statusCode: 404,
  });
});

test("revokeInvitation marks pending invitations revoked and rejects non-pending ones", async () => {
  let status = "pending";
  const { db, service } = createMembersService([
    (sql) =>
      /SELECT id, status, invited_by_user_id FROM workspace_invitations/.test(sql)
        ? [{ id: INVITATION_ID, status, invited_by_user_id: ADMIN_ID }]
        : undefined,
  ]);

  await service.revokeInvitation(WORKSPACE_ID, ADMIN_ID, INVITATION_ID);
  assert.ok(db.calls.some((call) => /SET status = 'revoked'/.test(call.sql)));

  status = "revoked";
  await assert.rejects(service.revokeInvitation(WORKSPACE_ID, OWNER_ID, INVITATION_ID), {
    code: "BAD_REQUEST",
    statusCode: 400,
  });
  await assert.rejects(service.revokeInvitation(WORKSPACE_ID, USER_ID, INVITATION_ID), {
    code: "ACCESS_DENIED",
    statusCode: 403,
  });
});
