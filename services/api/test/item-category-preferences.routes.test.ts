import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import type { ItemCategoryPreferencesService } from "../src/item-category-preferences/service.ts";
import { createWorkspaceItemCategoryPreferencesRoute } from "../src/routes/workspace-item-category-preferences.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  setHeader(_name: string, _value: string): void {}
  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

type Prefs = {
  favoriteCategoryIds: string[];
  favoriteTemplateIds: string[];
  favoriteOrder: string[];
  personalDataBootstrapDismissed: boolean;
};

function createPreferencesServiceStub(initial?: Partial<Prefs>): ItemCategoryPreferencesService {
  let state: Prefs = {
    favoriteCategoryIds: ["login", "personal_data"],
    favoriteTemplateIds: [],
    favoriteOrder: ["category:login", "category:personal_data"],
    personalDataBootstrapDismissed: false,
    ...initial,
  };

  return {
    getPreferences: async () => ({ ...state }),
    updatePreferences: async (_workspaceId, _userId, input) => {
      state = {
        favoriteCategoryIds: input.favoriteCategoryIds,
        favoriteTemplateIds: input.favoriteTemplateIds,
        favoriteOrder: input.favoriteOrder,
        personalDataBootstrapDismissed:
          input.personalDataBootstrapDismissed === undefined
            ? state.personalDataBootstrapDismissed
            : input.personalDataBootstrapDismissed,
      };
      return { ...state };
    },
    setPersonalDataBootstrapDismissed: async (_workspaceId, _userId, dismissed) => {
      state = { ...state, personalDataBootstrapDismissed: dismissed };
      return { ...state };
    },
  } as unknown as ItemCategoryPreferencesService;
}

async function dispatch(input: {
  method: string;
  workspaceId?: string;
  userId?: string | null;
  body?: unknown;
  service?: ItemCategoryPreferencesService;
}) {
  const service = input.service ?? createPreferencesServiceStub();
  const handler = createWorkspaceItemCategoryPreferencesRoute(service, async () => input.userId ?? null);
  const req = {
    method: input.method,
    ...(input.body !== undefined ? { body: input.body } : {}),
  } as IncomingMessage;
  const res = new MockResponse();
  await handler({
    req,
    res: res as unknown as ServerResponse,
    params: { workspaceId: input.workspaceId ?? "1000000000000000001" },
    requestId: "req-1",
  });
  return res;
}

test("GET /workspaces/:workspaceId/item-category-preferences requires auth", async () => {
  const res = await dispatch({
    method: "GET",
    userId: null,
  });
  assert.equal(res.statusCode, 401);
});

test("GET returns personal_data_bootstrap_dismissed", async () => {
  const res = await dispatch({
    method: "GET",
    userId: "u1",
    service: createPreferencesServiceStub({ personalDataBootstrapDismissed: true }),
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as {
    personal_data_bootstrap_dismissed: boolean;
    favorite_category_ids: string[];
  };
  assert.equal(payload.personal_data_bootstrap_dismissed, true);
  assert.ok(payload.favorite_category_ids.includes("login"));
});

test("PUT personal_data_bootstrap_dismissed alone sets the flag (new-device-after-purge)", async () => {
  const service = createPreferencesServiceStub({ personalDataBootstrapDismissed: false });
  const putRes = await dispatch({
    method: "PUT",
    userId: "u1",
    body: { personal_data_bootstrap_dismissed: true },
    service,
  });
  assert.equal(putRes.statusCode, 200);
  const putPayload = JSON.parse(putRes.body) as { personal_data_bootstrap_dismissed: boolean };
  assert.equal(putPayload.personal_data_bootstrap_dismissed, true);

  // Simulate a new browser: GET with no local state — server flag alone must be true.
  const getRes = await dispatch({
    method: "GET",
    userId: "u1",
    service,
  });
  assert.equal(getRes.statusCode, 200);
  const getPayload = JSON.parse(getRes.body) as { personal_data_bootstrap_dismissed: boolean };
  assert.equal(getPayload.personal_data_bootstrap_dismissed, true);
});

test("PUT favorites without dismiss flag preserves dismissed", async () => {
  const service = createPreferencesServiceStub({ personalDataBootstrapDismissed: true });
  const res = await dispatch({
    method: "PUT",
    userId: "u1",
    body: {
      favorite_category_ids: ["login"],
      favorite_template_ids: [],
      favorite_order: ["category:login"],
    },
    service,
  });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as {
    personal_data_bootstrap_dismissed: boolean;
    favorite_category_ids: string[];
  };
  assert.equal(payload.personal_data_bootstrap_dismissed, true);
  assert.deepEqual(payload.favorite_category_ids, ["login"]);
});

test("PUT rejects non-boolean personal_data_bootstrap_dismissed", async () => {
  const res = await dispatch({
    method: "PUT",
    userId: "u1",
    body: { personal_data_bootstrap_dismissed: "yes" },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "INVALID_PERSONAL_DATA_BOOTSTRAP_DISMISSED");
});
