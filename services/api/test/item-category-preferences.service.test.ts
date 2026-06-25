import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseFavoriteCategoryIdsPayload,
  sanitizeFavoriteCategoryIds,
} from "../src/item-category-preferences/service.ts";

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
