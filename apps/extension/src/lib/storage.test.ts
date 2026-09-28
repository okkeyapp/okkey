import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWebBaseUrl, resolveApiBaseFromWebBase } from "./storage.ts";

test("normalizeWebBaseUrl adds https and strips path", () => {
  assert.equal(normalizeWebBaseUrl("app.okkey.io"), "https://app.okkey.io");
  assert.equal(normalizeWebBaseUrl("http://localhost:5173/foo"), "http://localhost:5173");
});

test("resolveApiBaseFromWebBase maps localhost web to :4000", () => {
  assert.equal(resolveApiBaseFromWebBase("http://localhost:5173"), "http://localhost:4000");
  assert.equal(resolveApiBaseFromWebBase("https://app.okkey.io"), "https://app.okkey.io");
});
