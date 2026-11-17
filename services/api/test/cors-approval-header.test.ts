import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import { DEVICE_APPROVAL_STATUS_HEADER } from "../src/device/approval-status.ts";
import { createCorsMiddleware } from "../src/middleware/cors.ts";

test("CORS preflight allows the device approval status header", async () => {
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end() {},
  };
  const ctx = {
    requestId: "cors-preflight",
    params: {},
    req: {
      method: "OPTIONS",
      headers: { origin: "http://127.0.0.1:5173" },
    } as IncomingMessage,
    res: res as unknown as ServerResponse,
  };
  let continued = false;
  await createCorsMiddleware("http://127.0.0.1:5173")(ctx, async () => {
    continued = true;
  });
  assert.equal(res.statusCode, 204);
  assert.equal(continued, false);
  assert.match(
    headers.get("access-control-allow-headers") ?? "",
    new RegExp(DEVICE_APPROVAL_STATUS_HEADER, "i"),
  );
});
