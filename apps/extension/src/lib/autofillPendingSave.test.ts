import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

type SessionBag = Record<string, unknown>;

function installSessionMock(initial: SessionBag = {}): {
  store: SessionBag;
  getCalls: number;
  setCalls: number;
  slowGet: (ms: number) => void;
} {
  const store: SessionBag = { ...initial };
  let getCalls = 0;
  let setCalls = 0;
  let getDelayMs = 0;
  const g = globalThis as {
    browser?: {
      storage: {
        session: {
          get: (key: string) => Promise<SessionBag>;
          set: (items: SessionBag) => Promise<void>;
        };
      };
      tabs: { onRemoved: { addListener: (fn: (tabId: number) => void) => void } };
    };
  };
  g.browser = {
    storage: {
      session: {
        async get(key: string) {
          getCalls += 1;
          if (getDelayMs > 0) {
            await new Promise((r) => setTimeout(r, getDelayMs));
          }
          return { [key]: store[key] };
        },
        async set(items: SessionBag) {
          setCalls += 1;
          Object.assign(store, items);
        },
      },
    },
    tabs: { onRemoved: { addListener() {} } },
  };
  return {
    store,
    get getCalls() {
      return getCalls;
    },
    get setCalls() {
      return setCalls;
    },
    slowGet(ms: number) {
      getDelayMs = ms;
    },
  };
}

describe("autofillPendingSave restore", () => {
  beforeEach(() => {
    // Cache-bust so each test gets a fresh module graph + empty Map.
  });

  afterEach(() => {
    const g = globalThis as { browser?: unknown };
    delete g.browser;
  });

  async function loadFresh() {
    const stamp = `${Date.now()}-${Math.random()}`;
    return import(`./autofillPendingSave.ts?t=${stamp}`);
  }

  it("set then get returns pending with capture URL (redirect restore)", async () => {
    installSessionMock();
    const api = await loadFresh();
    await api.setPendingSaveOffer(7, {
      username: "alice",
      password: "s3cret",
      captureUrl: "https://example.com/login",
      websiteUrl: "https://example.com/login",
      formType: "login",
    });
    const got = await api.getPendingSaveOffer(7);
    assert.equal(got.status, "ok");
    if (got.status !== "ok") {
      return;
    }
    assert.equal(got.pending.captureUrl, "https://example.com/login");
    assert.equal(got.pending.websiteUrl, "https://example.com/login");
    assert.equal(got.pending.username, "alice");
  });

  it("hydrates from session storage after SW cold start", async () => {
    const sessionKey = "okkey.autofill.pendingSaveByTab";
    installSessionMock({
      [sessionKey]: {
        "42": {
          username: "bob",
          password: "pw",
          captureUrl: "https://shop.test/account/login",
          websiteUrl: "https://shop.test/account/login",
          formType: "login",
          createdAt: Date.now(),
          dismissed: false,
          interacted: false,
        },
      },
    });
    const api = await loadFresh();
    const got = await api.getPendingSaveOffer(42);
    assert.equal(got.status, "ok");
    if (got.status !== "ok") {
      return;
    }
    assert.equal(got.pending.captureUrl, "https://shop.test/account/login");
  });

  it("concurrent get during slow hydrate does not miss pending (SW cold-start race)", async () => {
    const sessionKey = "okkey.autofill.pendingSaveByTab";
    const mock = installSessionMock({
      [sessionKey]: {
        "9": {
          username: "cara",
          password: "hunter2",
          captureUrl: "https://app.test/signin",
          websiteUrl: "https://app.test/signin",
          formType: "login",
          createdAt: Date.now(),
          dismissed: false,
          interacted: false,
        },
      },
    });
    mock.slowGet(40);
    const api = await loadFresh();
    // Mimic scheduleRestorePendingSaveOffer: overlapping gets while storage.get is in flight.
    const [a, b, c] = await Promise.all([
      api.getPendingSaveOffer(9),
      api.getPendingSaveOffer(9),
      api.getPendingSaveOffer(9),
    ]);
    assert.equal(a.status, "ok");
    assert.equal(b.status, "ok");
    assert.equal(c.status, "ok");
    // One shared hydrate — not N independent early-returns on an empty map.
    assert.equal(mock.getCalls, 1);
  });

  it("dismissed pending is not restored", async () => {
    installSessionMock();
    const api = await loadFresh();
    await api.setPendingSaveOffer(3, {
      username: "d",
      password: "e",
      captureUrl: "https://example.com/login",
      websiteUrl: "https://example.com/login",
    });
    await api.markPendingSaveDismissed(3);
    const got = await api.getPendingSaveOffer(3);
    assert.equal(got.status, "none");
  });
});
