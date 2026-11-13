import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideHttpBasicAuth, sanitizeHttpAuthLog, type HttpAuthMatch } from "./httpAuthDecision.ts";
import {
  parseHttpAuthDecision,
  parseHttpAuthPromptResponse,
  toHttpAuthPromptView,
} from "./httpAuthMessages.ts";

const PASSWORD = "pw-do-not-log-9f3a";

const MATCH: HttpAuthMatch = {
  itemId: "item-1",
  title: "Lab",
  username: "ada",
  password: PASSWORD,
};

function lines(): { log: (line: string) => void; all: () => string } {
  const saved: string[] = [];
  return {
    log: (line) => {
      saved.push(line);
    },
    all: () => saved.join("\n"),
  };
}

describe("decideHttpBasicAuth", () => {
  it("returns nothing when the setting is off and does not ask or search", async () => {
    let asked = false;
    let searched = false;
    const logged = lines();
    const result = await decideHttpBasicAuth({
      enabled: false,
      details: { url: "https://127.0.0.1/", scheme: "basic", isProxy: false },
      findMatches: async () => {
        searched = true;
        return [MATCH];
      },
      requestConsent: async () => {
        asked = true;
        return { outcome: "confirm", itemId: MATCH.itemId, insecureHttpConfirmed: true };
      },
      log: logged.log,
    });
    assert.equal(result, undefined);
    assert.equal(searched, false);
    assert.equal(asked, false);
    assert.equal(logged.all().includes(PASSWORD), false);
  });

  it("returns nothing when nothing matches, the user declines, or the dialog closes or times out", async () => {
    for (const consent of [
      null,
      { outcome: "decline" as const },
      { outcome: "closed" as const },
      { outcome: "timeout" as const },
    ]) {
      const logged = lines();
      const result = await decideHttpBasicAuth({
        enabled: true,
        details: { url: "https://127.0.0.1/secret", scheme: "basic" },
        findMatches: async () => (consent === null ? [] : [MATCH]),
        requestConsent: async () => {
          if (consent === null) {
            throw new Error("consent should not run");
          }
          return consent;
        },
        log: logged.log,
      });
      assert.equal(result, undefined);
      assert.equal(logged.all().includes(PASSWORD), false);
      assert.equal(/authorization\s*:/i.test(logged.all()), false);
    }
  });

  it("returns nothing for http until the cleartext warning is confirmed", async () => {
    const logged = lines();
    const result = await decideHttpBasicAuth({
      enabled: true,
      details: { url: "http://127.0.0.1:8080/admin", scheme: "basic" },
      findMatches: async () => [MATCH],
      requestConsent: async (view) => {
        assert.equal(view.insecureHttp, true);
        assert.equal(view.origin, "http://127.0.0.1:8080");
        assert.equal(JSON.stringify(view).includes(PASSWORD), false);
        return { outcome: "confirm", itemId: MATCH.itemId, insecureHttpConfirmed: false };
      },
      log: logged.log,
    });
    assert.equal(result, undefined);
    assert.match(logged.all(), /http warning not confirmed/);
    assert.equal(logged.all().includes(PASSWORD), false);
  });

  it("returns credentials only after https confirm or http second confirm", async () => {
    const https = await decideHttpBasicAuth({
      enabled: true,
      details: { url: "https://127.0.0.1:8443/secret", scheme: "Basic" },
      findMatches: async () => [MATCH],
      requestConsent: async (view) => {
        assert.equal(view.insecureHttp, false);
        assert.equal(view.origin, "https://127.0.0.1:8443");
        return { outcome: "confirm", itemId: MATCH.itemId, insecureHttpConfirmed: false };
      },
      log: (line) => {
        assert.equal(line.includes(PASSWORD), false);
      },
    });
    assert.deepEqual(https, {
      authCredentials: { username: "ada", password: PASSWORD },
    });

    const http = await decideHttpBasicAuth({
      enabled: true,
      details: { url: "http://127.0.0.1:8080/", scheme: "basic" },
      findMatches: async () => [MATCH],
      requestConsent: async () => ({
        outcome: "confirm",
        itemId: MATCH.itemId,
        insecureHttpConfirmed: true,
      }),
    });
    assert.equal(http?.authCredentials.password, PASSWORD);
  });

  it("asks again for a repeated challenge", async () => {
    let asks = 0;
    const input = {
      enabled: true,
      details: { url: "https://host/again", scheme: "basic" },
      findMatches: async () => [MATCH],
      requestConsent: async () => {
        asks += 1;
        return {
          outcome: "confirm" as const,
          itemId: MATCH.itemId,
          insecureHttpConfirmed: false,
        };
      },
    };
    await decideHttpBasicAuth(input);
    await decideHttpBasicAuth(input);
    assert.equal(asks, 2);
  });

  it("does not log a password thrown from matching or consent", async () => {
    const logged = lines();
    const failedMatch = await decideHttpBasicAuth({
      enabled: true,
      details: { url: "https://host/", scheme: "basic" },
      findMatches: async () => {
        throw new Error(`boom ${PASSWORD} Authorization: Basic abc`);
      },
      requestConsent: async () => ({ outcome: "decline" }),
      log: logged.log,
    });
    assert.equal(failedMatch, undefined);
    assert.equal(logged.all(), "http-auth match failed");

    const failedConsent = lines();
    const result = await decideHttpBasicAuth({
      enabled: true,
      details: { url: "https://host/", scheme: "basic" },
      findMatches: async () => [MATCH],
      requestConsent: async () => {
        throw new Error(PASSWORD);
      },
      log: failedConsent.log,
    });
    assert.equal(result, undefined);
    assert.equal(failedConsent.all(), "http-auth consent failed");
    assert.equal(failedConsent.all().includes(PASSWORD), false);
  });

  it("ignores proxy and non-basic schemes", async () => {
    const proxy = await decideHttpBasicAuth({
      enabled: true,
      details: { url: "https://host/", scheme: "basic", isProxy: true },
      findMatches: async () => [MATCH],
      requestConsent: async () => ({ outcome: "confirm", itemId: MATCH.itemId, insecureHttpConfirmed: true }),
    });
    assert.equal(proxy, undefined);
    const digest = await decideHttpBasicAuth({
      enabled: true,
      details: { url: "https://host/", scheme: "digest" },
      findMatches: async () => [MATCH],
      requestConsent: async () => ({ outcome: "confirm", itemId: MATCH.itemId, insecureHttpConfirmed: true }),
    });
    assert.equal(digest, undefined);
  });
});

describe("sanitizeHttpAuthLog", () => {
  it("drops passwords and Authorization headers", () => {
    assert.equal(sanitizeHttpAuthLog("http-auth confirmed origin=https://host:443", [PASSWORD]), "http-auth confirmed origin=https://host:443");
    assert.equal(sanitizeHttpAuthLog(`leak ${PASSWORD}`, [PASSWORD]), null);
    assert.equal(sanitizeHttpAuthLog("Authorization: Basic abc", []), null);
    assert.equal(sanitizeHttpAuthLog("authorization: Bearer x", [""]), null);
  });
});

describe("http auth prompt messages", () => {
  it("strips passwords from the confirmation view and from parsed messages", () => {
    const view = toHttpAuthPromptView({
      origin: "https://host",
      insecureHttp: false,
      items: [MATCH],
    });
    assert.equal(JSON.stringify(view).includes(PASSWORD), false);
    assert.equal("password" in view.items[0]!, false);

    const parsed = parseHttpAuthDecision({
      type: "okkey.httpAuth.decision",
      challengeId: "c1",
      outcome: "confirm",
      itemId: "item-1",
      insecureHttpConfirmed: true,
      password: PASSWORD,
      authorization: "Authorization: Basic abc",
    });
    assert.equal(JSON.stringify(parsed).includes(PASSWORD), false);
    assert.equal(JSON.stringify(parsed).toLowerCase().includes("authorization"), false);

    const response = parseHttpAuthPromptResponse({
      ok: true,
      prompt: {
        origin: "https://host",
        insecureHttp: false,
        items: [{ ...MATCH, password: PASSWORD }],
      },
    });
    assert.equal(JSON.stringify(response).includes(PASSWORD), false);
  });
});
