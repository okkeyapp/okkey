import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ItemCategoryPreferencesService,
  parseFavoriteCategoryIdsPayload,
  parseFavoriteTemplateIdsPayload,
  parsePersonalDataBootstrapDismissedPayload,
  reconcileFavoriteOrder,
  sanitizeFavoriteCategoryIds,
} from "../src/item-category-preferences/service.ts";
import type { WorkspaceMemberItemCategoryPreferencesRecord } from "../src/storage/workspace-member-item-category-preferences.ts";

test("sanitizeFavoriteCategoryIds keeps known ids in order and drops unknown", () => {
  assert.deepEqual(sanitizeFavoriteCategoryIds(["login", "unknown", "login", "server"]), [
    "login",
    "server",
  ]);
});

test("parseFavoriteCategoryIdsPayload rejects invalid payloads", () => {
  assert.equal(parseFavoriteCategoryIdsPayload(null), null);
  assert.equal(parseFavoriteCategoryIdsPayload({}), null);
  assert.deepEqual(parseFavoriteCategoryIdsPayload(["login", "passport"]), ["login", "passport"]);
});

test("parseFavoriteTemplateIdsPayload rejects invalid payloads", () => {
  assert.equal(parseFavoriteTemplateIdsPayload(null), null);
  assert.equal(parseFavoriteTemplateIdsPayload({}), null);
  assert.deepEqual(parseFavoriteTemplateIdsPayload(["tpl-1", "tpl-2"]), ["tpl-1", "tpl-2"]);
});

test("parsePersonalDataBootstrapDismissedPayload accepts booleans only", () => {
  assert.equal(parsePersonalDataBootstrapDismissedPayload(true), true);
  assert.equal(parsePersonalDataBootstrapDismissedPayload(false), false);
  assert.equal(parsePersonalDataBootstrapDismissedPayload("true"), null);
  assert.equal(parsePersonalDataBootstrapDismissedPayload(1), null);
});

test("reconcileFavoriteOrder keeps mixed order and appends missing favorites", () => {
  assert.deepEqual(
    reconcileFavoriteOrder(
      ["template:tpl-2", "category:login", "template:tpl-1"],
      ["login", "server"],
      ["tpl-1", "tpl-2"],
    ),
    ["template:tpl-2", "category:login", "template:tpl-1", "category:server"],
  );
});

test("setPersonalDataBootstrapDismissed persists across get (new-device-after-purge)", async () => {
  const store = new Map<string, WorkspaceMemberItemCategoryPreferencesRecord>();
  const key = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`;
  const preferences = {
    async find(workspaceId: string, userId: string) {
      return store.get(key(workspaceId, userId)) ?? null;
    },
    async upsert(input: {
      workspaceId: string;
      userId: string;
      favoriteCategoryIds: string[];
      favoriteTemplateIds: string[];
      favoriteOrder: string[];
      personalDataBootstrapDismissed?: boolean;
    }) {
      const existing = store.get(key(input.workspaceId, input.userId));
      const record: WorkspaceMemberItemCategoryPreferencesRecord = {
        workspaceId: input.workspaceId,
        userId: input.userId,
        favoriteCategoryIds: input.favoriteCategoryIds,
        favoriteTemplateIds: input.favoriteTemplateIds,
        favoriteOrder: input.favoriteOrder,
        personalDataBootstrapDismissed:
          input.personalDataBootstrapDismissed === undefined
            ? (existing?.personalDataBootstrapDismissed ?? false)
            : input.personalDataBootstrapDismissed,
        createdAt: existing?.createdAt ?? "t0",
        updatedAt: "t1",
      };
      store.set(key(input.workspaceId, input.userId), record);
      return record;
    },
    async setPersonalDataBootstrapDismissed(input: {
      workspaceId: string;
      userId: string;
      dismissed: boolean;
    }) {
      const existing = store.get(key(input.workspaceId, input.userId));
      if (!existing) {
        return null;
      }
      const record = {
        ...existing,
        personalDataBootstrapDismissed: input.dismissed,
        updatedAt: "t2",
      };
      store.set(key(input.workspaceId, input.userId), record);
      return record;
    },
  };

  const service = new ItemCategoryPreferencesService({
    preferences: preferences as never,
    workspaces: {
      findById: async () =>
        ({
          id: "w1",
          name: "Personal",
          ownerId: "u1",
          planTier: "FREE",
          planCustomOverride: false,
          planFeatureOverrides: {},
          createdAt: "",
          updatedAt: "",
        }) as never,
      hasAccess: async () => true,
    },
    templates: {
      listByWorkspace: async () => [],
    } as never,
  });

  const before = await service.getPreferences("w1", "u1");
  assert.equal(before.personalDataBootstrapDismissed, false);

  const afterDelete = await service.setPersonalDataBootstrapDismissed("w1", "u1", true);
  assert.equal(afterDelete.personalDataBootstrapDismissed, true);

  // New device / cleared site data: only the server row is available.
  const afterPurgeNewDevice = await service.getPreferences("w1", "u1");
  assert.equal(afterPurgeNewDevice.personalDataBootstrapDismissed, true);
});
