import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExtensionAuthStartUrl,
  createPkcePair,
  EXTENSION_AUTH_CLIENT_ID,
  generateRandomString,
  sha256Base64Url,
} from "./pkce.ts";

/** RFC 7636 appendix B. */
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

test("S256 challenge matches the RFC 7636 test vector (QA extension PKCE)", async () => {
  assert.equal(await sha256Base64Url(RFC_VERIFIER), RFC_CHALLENGE);
});

test("PKCE verifier length and charset (QA extension PKCE)", () => {
  const verifier = generateRandomString(32);
  assert.equal(verifier.length, 43);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  const again = generateRandomString(32);
  assert.notEqual(verifier, again);
});

test("PKCE state is random and unguessable across calls (QA extension PKCE)", async () => {
  const first = await createPkcePair();
  const second = await createPkcePair();
  assert.equal(first.state.length, 32);
  assert.match(first.state, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.codeVerifier, second.codeVerifier);
  assert.equal(first.codeChallenge, await sha256Base64Url(first.codeVerifier));
  assert.equal(first.codeVerifier.length, 43);
});

test("extension auth start URL carries S256 challenge parameters", () => {
  const url = new URL(
    buildExtensionAuthStartUrl({
      webBaseUrl: "https://vault.example",
      redirectUri: "chrome-extension://abcdefghijklmnop/auth-callback.html",
      state: "state-1",
      codeChallenge: RFC_CHALLENGE,
    }),
  );
  assert.equal(url.origin + url.pathname, "https://vault.example/auth/extension/start");
  assert.equal(url.searchParams.get("client_id"), EXTENSION_AUTH_CLIENT_ID);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), RFC_CHALLENGE);
  assert.equal(url.searchParams.get("state"), "state-1");
});
