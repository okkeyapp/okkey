import assert from "node:assert/strict";
import test from "node:test";

import { resolveSalesEmail } from "../src/config.ts";

test("resolveSalesEmail requires an explicit address", () => {
  assert.throws(() => resolveSalesEmail(undefined), /OKKEY_SALES_EMAIL is required/);
  assert.throws(() => resolveSalesEmail(""), /OKKEY_SALES_EMAIL is required/);
  assert.throws(() => resolveSalesEmail("   "), /OKKEY_SALES_EMAIL is required/);
  assert.throws(() => resolveSalesEmail("not-an-email"), /valid email/);
});

test("resolveSalesEmail accepts a trimmed address", () => {
  assert.equal(resolveSalesEmail("  sales@example.com  "), "sales@example.com");
});
