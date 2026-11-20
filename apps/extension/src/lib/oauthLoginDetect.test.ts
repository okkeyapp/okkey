import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import {
  detectOauthFromControl,
  detectOauthFromLabel,
  detectOauthSignInCues,
  isOauthIdpHost,
  isOauthSignInControl,
} from "./oauthLoginDetect.ts";

describe("detectOauthFromLabel", () => {
  it("detects Continue with Google / Sign in with Apple", () => {
    assert.deepEqual(detectOauthFromLabel("Continue with Google"), {
      detected: true,
      providerHint: "Google",
    });
    assert.deepEqual(detectOauthFromLabel("Sign in with Apple"), {
      detected: true,
      providerHint: "Apple",
    });
    assert.deepEqual(detectOauthFromLabel("Log in with Microsoft"), {
      detected: true,
      providerHint: "Microsoft",
    });
  });

  it("detects Russian wording", () => {
    assert.deepEqual(detectOauthFromLabel("Войти через Google"), {
      detected: true,
      providerHint: "Google",
    });
    assert.deepEqual(detectOauthFromLabel("Продолжить с Apple"), {
      detected: true,
      providerHint: "Apple",
    });
  });

  it("does not match ordinary login copy", () => {
    assert.deepEqual(detectOauthFromLabel("Sign in"), { detected: false });
    assert.deepEqual(detectOauthFromLabel("Continue"), { detected: false });
    assert.deepEqual(detectOauthFromLabel("Email and password"), { detected: false });
  });
});

describe("isOauthIdpHost", () => {
  it("recognizes common IdP hosts", () => {
    assert.equal(isOauthIdpHost("accounts.google.com"), true);
    assert.equal(isOauthIdpHost("appleid.apple.com"), true);
    assert.equal(isOauthIdpHost("login.microsoftonline.com"), true);
    assert.equal(isOauthIdpHost("github.com"), true);
  });

  it("rejects relying-party hosts", () => {
    assert.equal(isOauthIdpHost("app.example.com"), false);
    assert.equal(isOauthIdpHost("google.com"), false);
  });
});

describe("detectOauthSignInCues / isOauthSignInControl", () => {
  it("finds a Continue with Google button in the DOM", () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <button type="button">Continue with Google</button>
        <input type="email" />
      </body></html>`,
      { url: "https://app.example.com/login" },
    );
    const detection = detectOauthSignInCues(dom.window.document);
    assert.equal(detection.detected, true);
    assert.equal(detection.providerHint, "Google");
    const btn = dom.window.document.querySelector("button");
    assert.ok(btn);
    assert.equal(isOauthSignInControl(btn), true);
  });

  it("detects OAuth href on an anchor", () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <a href="https://accounts.google.com/o/oauth2/v2/auth?client_id=x">Google</a>
      </body></html>`,
      { url: "https://shop.example.com/signin" },
    );
    const detection = detectOauthSignInCues(dom.window.document);
    assert.equal(detection.detected, true);
    assert.equal(detection.providerHint, "Google");
    const anchor = dom.window.document.querySelector("a");
    assert.ok(anchor);
    assert.deepEqual(detectOauthFromControl(anchor), {
      detected: true,
      providerHint: "Google",
    });
  });

  it("returns not detected on a plain password form", () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <form>
          <input type="email" />
          <input type="password" />
          <button type="submit">Sign in</button>
        </form>
      </body></html>`,
      { url: "https://app.example.com/login" },
    );
    assert.deepEqual(detectOauthSignInCues(dom.window.document), { detected: false });
  });
});
