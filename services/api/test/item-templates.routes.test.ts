import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import type { ItemTemplatesService } from "../src/item-templates/service.ts";
import { createWorkspaceItemTemplatesCreateRoute } from "../src/routes/workspace-item-templates.ts";

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

async function dispatchCreate(input: {
  userId?: string | null;
  workspaceId?: string;
  body?: unknown;
  service?: ItemTemplatesService;
}) {
  const service = (input.service ??
    ({
      create: async () => {
        throw new Error("should not be called");
      },
    } as unknown as ItemTemplatesService));
  const handler = createWorkspaceItemTemplatesCreateRoute(service, async () => input.userId ?? null);
  const req = {
    method: "POST",
    ...(input.body !== undefined ? { body: input.body } : {}),
  } as IncomingMessage;
  const res = new MockResponse();
  await handler({
    req,
    res: res as unknown as ServerResponse,
    params: { workspaceId: input.workspaceId ?? "1000000000000000091" },
    requestId: "req-templates-1",
  });
  return res;
}

test("POST item-templates rejects non-string id with 400", async () => {
  const res = await dispatchCreate({
    userId: "u1",
    body: {
      id: 1000000000000000001,
      name: "Template",
      category_id: "login",
      payload: {
        record_name: "",
        vault_id: "1000000000000000002",
        folder_id: "__none__",
        sections: [],
        tags: [],
      },
    },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "INVALID_TEMPLATE_ID");
});
