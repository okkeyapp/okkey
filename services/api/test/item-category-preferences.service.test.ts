import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseFavoriteCategoryIdsPayload,
  parseFavoriteTemplateIdsPayload,
  reconcileFavoriteOrder,
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

test("parseFavoriteTemplateIdsPayload rejects invalid payloads", () => {
  assert.equal(parseFavoriteTemplateIdsPayload(null), null);
  assert.equal(parseFavoriteTemplateIdsPayload({}), null);
  assert.deepEqual(parseFavoriteTemplateIdsPayload(["tpl-1", "tpl-2"]), ["tpl-1", "tpl-2"]);
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
