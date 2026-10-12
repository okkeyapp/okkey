import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  captureFormPageUrl,
  normalizeSaveUrl,
  saveUrlsEqual,
  websiteUrlForSaveOffer,
} from "./autofillSaveUrls.ts";

describe("captureFormPageUrl", () => {
  it("keeps origin + pathname (login form page)", () => {
    assert.equal(
      captureFormPageUrl({ origin: "https://example.com", pathname: "/login" }),
      "https://example.com/login",
    );
  });
});

describe("websiteUrlForSaveOffer", () => {
  it("login → capture form URL (not post-redirect)", () => {
    assert.equal(
      websiteUrlForSaveOffer("https://example.com/account/login", "login"),
      "https://example.com/account/login",
    );
  });

  it("register → site home origin/", () => {
    assert.equal(
      websiteUrlForSaveOffer("https://example.com/register", "register"),
      "https://example.com/",
    );
    assert.equal(
      websiteUrlForSaveOffer("https://shop.example.com/signup?ref=1", "register"),
      "https://shop.example.com/",
    );
  });

  it("unknown → capture path (same as login)", () => {
    assert.equal(
      websiteUrlForSaveOffer("https://example.com/auth", "unknown"),
      "https://example.com/auth",
    );
  });
});

describe("saveUrlsEqual / normalizeSaveUrl", () => {
  it("treats trailing slash as equal", () => {
    assert.equal(saveUrlsEqual("https://example.com/", "https://example.com"), true);
    assert.equal(normalizeSaveUrl("https://example.com/login/"), "https://example.com/login");
  });

  it("distinguishes path segments", () => {
    assert.equal(
      saveUrlsEqual("https://example.com/login", "https://example.com/dashboard"),
      false,
    );
  });
});
