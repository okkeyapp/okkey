import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { HttpApp } from "../src/http.ts";
import {
  downloadSignedPackage,
  feedRequestUrl,
  fetchUpdateFeed,
  headersForSameOriginRequest,
} from "../src/system-updates/feed.ts";
import {
  generateUpdateKeyPair,
  parseUpdateFeed,
  signOfflinePackage,
  verifyOfflinePackage,
  type OfflinePackagePayload,
} from "../src/system-updates/package-format.ts";
import { createHttpUpdateAgentClient } from "../src/system-updates/agent-client.ts";
import {
  buildFeedRequestHeaders,
  createSystemUpdateService,
  visibleUpdates,
  type UpdateAgentClient,
  type UpdateJob,
} from "../src/system-updates/service.ts";
import { compareVersions, coreSatisfiesMinimum, shouldShowUpdate } from "../src/system-updates/versions.ts";
import {
  applyVerifiedCorePackage,
  removeEnvValue,
  setEnvValue,
  type UpdateApplyEngine,
} from "../src/update-agent/apply.ts";
import {
  buildReplaceCreateBody,
  composeReplaceEnv,
  createDockerApplyEngine,
  userProvidedEnv,
  type DockerTransport,
} from "../src/update-agent/docker-engine.ts";
import { createUpdateAgent } from "../src/update-agent/server.ts";
import { SystemUpdateError } from "../src/system-updates/errors.ts";
import { BUNDLE_MAX_APPLY_BODY_BYTES, BUNDLE_MAX_DOCUMENT_BYTES } from "../src/system-updates/offline-bundle.ts";
import { registerSystemUpdateRoutes } from "../src/system-updates/routes.ts";
import type { SystemUpdateService } from "../src/system-updates/service.ts";

const payload = (overrides: Partial<OfflinePackagePayload> = {}): OfflinePackagePayload => ({
  format: "okkey-offline-package",
  formatVersion: 1,
  component: "okkey",
  version: "1.1.0",
  fromVersion: "1.0.0-beta.2",
  summary: "Security fixes",
  releasedAt: "2026-11-01T00:00:00.000Z",
  imageTag: "1.1.0",
  images: {
    api: "ghcr.io/okkeyapp/api:1.1.0",
    web: "ghcr.io/okkeyapp/web:1.1.0",
    worker: "ghcr.io/okkeyapp/worker:1.1.0",
  },
  ...overrides,
});

const enterprisePayload = (overrides: Partial<OfflinePackagePayload> = {}): OfflinePackagePayload =>
  payload({
    component: "enterprise",
    version: "2.0.0",
    fromVersion: "1.0.0",
    summary: "Enterprise module",
    imageTag: "2.0.0",
    minCoreVersion: "1.2.0",
    images: {
      "enterprise-api": "ghcr.io/example/enterprise-api:2.0.0",
      "enterprise-web": "ghcr.io/example/enterprise-web:2.0.0",
      "enterprise-worker": "ghcr.io/example/enterprise-worker:2.0.0",
    },
    ...overrides,
  });

function appWithRoutes(
  deploymentMode: "self_hosted" | "saas",
  service: SystemUpdateService,
): HttpApp {
  const app = new HttpApp();
  registerSystemUpdateRoutes(
    (method, path, handler) => app.route(method, path, handler),
    { deploymentMode },
    service,
    async (req) => {
      const header = req.headers["x-user-id"];
      return typeof header === "string" && header.trim() ? header.trim() : null;
    },
  );
  return app;
}

test("version compare treats a newer feed release as newer than a dismissed prerelease", () => {
  assert.equal(compareVersions("1.0.0-beta.10", "1.0.0-beta.2") > 0, true);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.2") > 0, true);
  assert.equal(shouldShowUpdate("1.1.0", "1.1.0"), false);
  assert.equal(shouldShowUpdate("1.2.0", "1.1.0"), true);
  assert.equal(shouldShowUpdate("1.1.0", null), true);
  assert.equal(shouldShowUpdate("dev", "dev"), false);
  assert.equal(shouldShowUpdate("dev-2", "dev"), true);
  assert.equal(coreSatisfiesMinimum("1.2.0", "1.2.0"), true);
  assert.equal(coreSatisfiesMinimum("1.3.0", "1.2.0"), true);
  assert.equal(coreSatisfiesMinimum("1.2.0-beta.1", "1.2.0"), false);
  assert.equal(coreSatisfiesMinimum("1.0.0", "1.2.0"), false);
  assert.equal(coreSatisfiesMinimum("dev", "1.2.0"), false);
});

test("empty feed URL and isolated mode do not call out", async () => {
  assert.equal(feedRequestUrl("", false), null);
  assert.equal(feedRequestUrl("   ", false), null);
  assert.equal(feedRequestUrl("https://updates.example/feed.json", true), null);
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error("should not fetch");
  };
  assert.equal(await fetchUpdateFeed("", false, fetchImpl), null);
  assert.equal(await fetchUpdateFeed("https://updates.example/feed.json", true, fetchImpl), null);
  assert.equal(called, false);
  const feedSource = readFileSync(new URL("../src/system-updates/feed.ts", import.meta.url), "utf8");
  const serviceSource = readFileSync(new URL("../src/system-updates/service.ts", import.meta.url), "utf8");
  assert.equal(feedSource.includes("https://"), false);
  assert.equal(serviceSource.includes("https://"), false);
  assert.doesNotMatch(feedSource + serviceSource, /planTier|plan_tier|salesEmail/);
});

test("feed check lists okkey and installed enterprise without applying or reading a license", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(payload(), keys.privateKeyPem);
  const raw = JSON.stringify(signed);
  const feed = {
    schema: "okkey.update-feed.v1",
    packages: [
      {
        component: "okkey",
        version: "1.1.0",
        fromVersion: "1.0.0-beta.2",
        summary: "Security fixes",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "http://updates.internal/okkey-1.1.0.okpkg",
        packageSha256: createHash("sha256").update(raw).digest("hex"),
      },
      {
        component: "enterprise",
        version: "2.0.0",
        fromVersion: "1.0.0",
        summary: "Enterprise module",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "http://updates.internal/enterprise-2.0.0.okpkg",
        packageSha256: "ab".repeat(32),
      },
    ],
  };
  const seen: string[] = [];
  const fetchImpl = async (url: string) => {
    seen.push(url);
    return new Response(JSON.stringify(feed), { status: 200 });
  };
  let applied = 0;
  const agent: UpdateAgentClient = {
    async start() {
      applied += 1;
      throw new Error("apply");
    },
    async get() {
      return null;
    },
  };
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0-beta.2",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    isolated: false,
    fetchImpl,
    agent,
    isAdmin: async () => true,
  });
  const status = await service.statusFor("owner");
  assert.equal(applied, 0);
  assert.deepEqual(seen, ["http://updates.internal/feed.json"]);
  assert.deepEqual(
    status.updates.map((update) => update.component),
    ["okkey", "enterprise"],
  );
  assert.equal(status.updates[0]?.fromVersion, "1.0.0-beta.2");
  assert.equal(status.updates[0]?.toVersion, "1.1.0");
  assert.equal(status.canApply, true);

  const hidden = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0-beta.2",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: "http://updates.internal/feed.json",
    isolated: false,
    fetchImpl,
    agent,
    isAdmin: async () => false,
  });
  const member = await hidden.statusFor("member");
  assert.deepEqual(
    member.updates.map((update) => update.component),
    ["okkey"],
  );
  assert.equal(member.canApply, false);
  await assert.rejects(() => hidden.apply("member", { source: "feed", component: "okkey" }), (error: unknown) => {
    assert.ok(error instanceof SystemUpdateError);
    assert.equal(error.code, "NOT_ADMIN");
    return true;
  });
  assert.equal(applied, 0);
});

test("one feed can fail while the other component still reports an update", async () => {
  const keys = generateUpdateKeyPair();
  const corePackage = signOfflinePackage(payload(), keys.privateKeyPem);
  const coreRaw = JSON.stringify(corePackage);
  const enterprisePackage = signOfflinePackage(
    payload({
      component: "enterprise",
      version: "3.0.0",
      fromVersion: "1.0.0",
      summary: "Enterprise module",
      images: { enterprise: "ghcr.io/okkeyapp/enterprise:3.0.0" },
    }),
    keys.privateKeyPem,
  );
  const enterpriseRaw = JSON.stringify(enterprisePackage);
  const coreFeed = {
    schema: "okkey.update-feed.v1",
    packages: [
      feedPackage("okkey", "1.1.0", "http://updates.internal/okkey-1.1.0.okpkg", coreRaw, {
        releaseNotesUrl: "http://updates.internal/notes/okkey-1.1.0",
      }),
      feedPackage("enterprise", "9.0.0", "http://updates.internal/ignored.okpkg", enterpriseRaw),
    ],
  };
  const enterpriseFeed = {
    schema: "okkey.update-feed.v1",
    packages: [
      feedPackage("enterprise", "3.0.0", "http://updates.internal/enterprise-3.0.0.okpkg", enterpriseRaw, {
        minCoreVersion: "1.1.0",
        releaseNotesUrl: "http://updates.internal/notes/enterprise-3.0.0",
      }),
    ],
  };
  const seen: string[] = [];
  const fetchImpl = async (url: string) => {
    seen.push(url);
    if (url.endsWith("/enterprise.json")) {
      return new Response("down", { status: 503 });
    }
    if (url.endsWith("/enterprise-3.0.0.okpkg")) {
      return new Response(enterpriseRaw, { status: 200 });
    }
    if (url.endsWith("/feed.json")) {
      return new Response(JSON.stringify(coreFeed), { status: 200 });
    }
    return new Response("missing", { status: 404 });
  };
  const started: unknown[] = [];
  const agent: UpdateAgentClient = {
    async start(document) {
      started.push(document);
      return {
        id: "11111111-1111-4111-8111-111111111111",
        status: "verifying",
        progress: 0,
        component: "enterprise",
        fromVersion: "1.0.0",
        toVersion: "3.0.0",
      };
    },
    async get() {
      return null;
    },
  };
  const failedEnterprise = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://updates.internal/enterprise.json",
    isolated: false,
    fetchImpl,
    agent,
    isAdmin: async () => true,
  });
  const partial = await failedEnterprise.statusFor("owner");
  assert.equal(partial.feedError, null);
  assert.equal(partial.offlineArchiveSupported, true);
  assert.deepEqual(
    partial.updates.map((update) => update.component),
    ["okkey"],
  );
  assert.equal(partial.components.find((row) => row.component === "okkey")?.checkError, null);
  assert.equal(partial.components.find((row) => row.component === "okkey")?.releaseNotesUrl, "http://updates.internal/notes/okkey-1.1.0");
  assert.equal(partial.components.find((row) => row.component === "enterprise")?.checkError, "FEED_FETCH_FAILED");
  assert.equal(partial.components.find((row) => row.component === "enterprise")?.update, null);
  assert.equal(partial.updates.some((update) => update.toVersion === "9.0.0"), false);

  seen.length = 0;
  const healthy = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/missing-core.json",
    enterpriseFeedUrl: "http://updates.internal/enterprise-feed.json",
    isolated: false,
    fetchImpl: async (url: string) => {
      seen.push(url);
      if (url.endsWith("/enterprise-feed.json")) {
        return new Response(JSON.stringify(enterpriseFeed), { status: 200 });
      }
      if (url.endsWith("/enterprise-3.0.0.okpkg")) {
        return new Response(enterpriseRaw, { status: 200 });
      }
      return new Response("down", { status: 503 });
    },
    agent,
    isAdmin: async () => true,
  });
  const enterpriseOnly = await healthy.statusFor("owner");
  assert.equal(enterpriseOnly.feedError, null);
  assert.equal(enterpriseOnly.components.find((row) => row.component === "okkey")?.checkError, "FEED_FETCH_FAILED");
  assert.equal(enterpriseOnly.components.find((row) => row.component === "enterprise")?.checkError, null);
  assert.equal(enterpriseOnly.components.find((row) => row.component === "enterprise")?.minCoreVersion, "1.1.0");
  assert.equal(
    enterpriseOnly.components.find((row) => row.component === "enterprise")?.releaseNotesUrl,
    "http://updates.internal/notes/enterprise-3.0.0",
  );
  assert.deepEqual(
    enterpriseOnly.updates.map((update) => update.toVersion),
    ["3.0.0"],
  );

  seen.length = 0;
  await healthy.apply("owner", { source: "feed", component: "enterprise" });
  assert.deepEqual(seen, [
    "http://updates.internal/enterprise-feed.json",
    "http://updates.internal/enterprise-3.0.0.okpkg",
  ]);
  assert.equal(started.length, 1);

  let enterpriseCalls = 0;
  const hidden = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://updates.internal/enterprise.json",
    isolated: false,
    fetchImpl: async (url: string) => {
      if (url.includes("enterprise")) {
        enterpriseCalls += 1;
      }
      return new Response(JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }), { status: 200 });
    },
    agent,
    isAdmin: async () => true,
  });
  const member = await hidden.statusFor("member");
  assert.equal(enterpriseCalls, 0);
  assert.deepEqual(
    member.components.map((row) => row.component),
    ["okkey"],
  );
});

test("status and apply build identical feed request headers", () => {
  const options = {
    enterpriseFeedUrl: "http://license.internal/enterprise.json",
    enterpriseLicenseKey: "license-key-for-headers",
  };
  const feedUrl = "http://license.internal/enterprise.json";
  const statusHeaders = buildFeedRequestHeaders(feedUrl, options);
  const applyHeaders = buildFeedRequestHeaders(feedUrl, options);
  assert.deepEqual(statusHeaders, applyHeaders);
  assert.deepEqual(statusHeaders, { "X-Okkey-License-Key": "license-key-for-headers" });
  assert.equal(buildFeedRequestHeaders(feedUrl, { ...options, enterpriseLicenseKey: "" }), undefined);
  assert.equal(buildFeedRequestHeaders(feedUrl, { ...options, enterpriseLicenseKey: "   " }), undefined);
  assert.equal(
    buildFeedRequestHeaders("http://cdn.example/package.okpkg", options),
    undefined,
  );
  assert.deepEqual(
    buildFeedRequestHeaders("http://license.internal/packages/enterprise.okpkg", options),
    { "X-Okkey-License-Key": "license-key-for-headers" },
  );
});

test("apply sends the license header to the license host and omits it for other origins", async () => {
  const licenseKey = "apply-license-key-do-not-log";
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(
    payload({
      component: "enterprise",
      version: "3.0.0",
      fromVersion: "1.0.0",
      summary: "Enterprise module",
      images: { enterprise: "ghcr.io/okkeyapp/enterprise:3.0.0" },
    }),
    keys.privateKeyPem,
  );
  const raw = JSON.stringify(signed);
  const licenseFeed = {
    schema: "okkey.update-feed.v1",
    packages: [
      feedPackage(
        "enterprise",
        "3.0.0",
        "http://license.internal/enterprise-3.0.0.okpkg",
        raw,
        { minCoreVersion: "1.0.0" },
      ),
    ],
  };
  const thirdPartyFeed = {
    schema: "okkey.update-feed.v1",
    packages: [
      feedPackage(
        "enterprise",
        "3.0.0",
        "http://cdn.example/enterprise-3.0.0.okpkg",
        raw,
        { minCoreVersion: "1.0.0" },
      ),
    ],
  };
  const requests: Array<{ url: string; licenseHeader: string | null }> = [];
  const agent: UpdateAgentClient = {
    async start() {
      return {
        id: "11111111-1111-4111-8111-111111111111",
        status: "verifying",
        progress: 0,
        component: "enterprise",
        fromVersion: "1.0.0",
        toVersion: "3.0.0",
      };
    },
    async get() {
      return null;
    },
  };

  const withKey = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://license.internal/enterprise.json",
    enterpriseLicenseKey: licenseKey,
    isolated: false,
    feedCacheTtlMs: 0,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(url), licenseHeader: headers.get("X-Okkey-License-Key") });
      if (String(url).endsWith("/enterprise.json")) {
        return new Response(JSON.stringify(licenseFeed), { status: 200 });
      }
      if (String(url).endsWith("/enterprise-3.0.0.okpkg")) {
        return new Response(raw, { status: 200 });
      }
      return new Response(JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }), {
        status: 200,
      });
    },
    agent,
    isAdmin: async () => true,
  });
  await withKey.statusFor("owner");
  await withKey.apply("owner", { source: "feed", component: "enterprise" });
  const statusFeed = requests.find((entry) => entry.url.endsWith("/enterprise.json"));
  const applyFeed = requests.filter((entry) => entry.url.endsWith("/enterprise.json"));
  const applyPackage = requests.find((entry) => entry.url.endsWith("/enterprise-3.0.0.okpkg"));
  assert.equal(statusFeed?.licenseHeader, licenseKey);
  assert.equal(applyFeed[1]?.licenseHeader, licenseKey);
  assert.equal(applyPackage?.licenseHeader, licenseKey);
  assert.equal(applyFeed[0]?.licenseHeader, applyFeed[1]?.licenseHeader);
  const statusJson = JSON.stringify(await withKey.statusFor("owner"));
  assert.equal(statusJson.includes(licenseKey), false);

  requests.length = 0;
  const withoutKey = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://license.internal/enterprise.json",
    isolated: false,
    feedCacheTtlMs: 0,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(url), licenseHeader: headers.get("X-Okkey-License-Key") });
      if (String(url).endsWith("/enterprise.json")) {
        return new Response(JSON.stringify(licenseFeed), { status: 200 });
      }
      if (String(url).endsWith("/enterprise-3.0.0.okpkg")) {
        return new Response(raw, { status: 200 });
      }
      return new Response(JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }), {
        status: 200,
      });
    },
    agent,
    isAdmin: async () => true,
  });
  await withoutKey.apply("owner", { source: "feed", component: "enterprise" });
  assert.deepEqual(
    requests.map((entry) => entry.licenseHeader),
    [null, null],
  );

  requests.length = 0;
  const thirdPartyPackage = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://license.internal/enterprise.json",
    enterpriseLicenseKey: licenseKey,
    isolated: false,
    feedCacheTtlMs: 0,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(url), licenseHeader: headers.get("X-Okkey-License-Key") });
      if (String(url).endsWith("/enterprise.json")) {
        return new Response(JSON.stringify(thirdPartyFeed), { status: 200 });
      }
      if (String(url).endsWith("/enterprise-3.0.0.okpkg")) {
        return new Response(raw, { status: 200 });
      }
      return new Response(JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }), {
        status: 200,
      });
    },
    agent,
    isAdmin: async () => true,
  });
  await thirdPartyPackage.apply("owner", { source: "feed", component: "enterprise" });
  assert.deepEqual(
    requests.map((entry) => ({
      host: new URL(entry.url).host,
      licenseHeader: entry.licenseHeader,
    })),
    [
      { host: "license.internal", licenseHeader: licenseKey },
      { host: "cdn.example", licenseHeader: null },
    ],
  );
});

test("same-origin redirect with a license key is followed and the key stays on that origin", async () => {
  const licenseKey = "redirect-same-origin-key";
  const feed = {
    schema: "okkey.update-feed.v1",
    packages: [
      {
        component: "enterprise",
        version: "3.1.0",
        fromVersion: "0.0.0",
        summary: "Enterprise",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "http://license.internal/enterprise-3.1.0.okpkg",
        packageSha256: "ab".repeat(32),
      },
    ],
  };
  const seen: Array<{ url: string; licenseHeader: string | null }> = [];
  const document = await fetchUpdateFeed(
    "http://license.internal/enterprise.json",
    false,
    async (url, init) => {
      const headers = new Headers(init?.headers);
      seen.push({ url: String(url), licenseHeader: headers.get("X-Okkey-License-Key") });
      if (String(url) === "http://license.internal/enterprise.json") {
        return new Response(null, {
          status: 302,
          headers: { location: "/v1/enterprise.json" },
        });
      }
      assert.equal(String(url), "http://license.internal/v1/enterprise.json");
      return new Response(JSON.stringify(feed), { status: 200 });
    },
    { "X-Okkey-License-Key": licenseKey },
  );
  assert.equal(document?.packages[0]?.version, "3.1.0");
  assert.deepEqual(seen, [
    { url: "http://license.internal/enterprise.json", licenseHeader: licenseKey },
    { url: "http://license.internal/v1/enterprise.json", licenseHeader: licenseKey },
  ]);
});

test("cross-origin redirect with a license key is rejected and the key never reaches the other host", async () => {
  const licenseKey = "redirect-cross-origin-key";
  const seen: Array<{ url: string; licenseHeader: string | null }> = [];
  await assert.rejects(
    () =>
      fetchUpdateFeed(
        "https://license.example/enterprise.json",
        false,
        async (url, init) => {
          const headers = new Headers(init?.headers);
          seen.push({ url: String(url), licenseHeader: headers.get("X-Okkey-License-Key") });
          return new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example/enterprise.json" },
          });
        },
        { "X-Okkey-License-Key": licenseKey },
      ),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "FEED_REDIRECT_FORBIDDEN");
      assert.equal(String(error.message).includes(licenseKey), false);
      return true;
    },
  );
  assert.deepEqual(seen, [
    { url: "https://license.example/enterprise.json", licenseHeader: licenseKey },
  ]);
  assert.equal(
    seen.some((entry) => entry.url.includes("cdn.example")),
    false,
  );
});

test("https to http redirect is rejected with or without a license key", async () => {
  for (const headers of [undefined, { "X-Okkey-License-Key": "downgrade-key" }] as const) {
    await assert.rejects(
      () =>
        fetchUpdateFeed("https://license.example/feed.json", false, async () => {
          return new Response(null, {
            status: 302,
            headers: { location: "http://license.example/feed.json" },
          });
        }, headers),
      (error: unknown) => {
        assert.ok(error instanceof SystemUpdateError);
        assert.equal(error.code, "FEED_REDIRECT_FORBIDDEN");
        return true;
      },
    );
  }
});

test("redirect chains stop at the redirect limit with a specific error code", async () => {
  let hops = 0;
  await assert.rejects(
    () =>
      fetchUpdateFeed(
        "https://license.example/feed.json",
        false,
        async () => {
          hops += 1;
          return new Response(null, {
            status: 302,
            headers: { location: `https://license.example/feed-${hops}.json` },
          });
        },
        { "X-Okkey-License-Key": "limit-key" },
      ),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "FEED_TOO_MANY_REDIRECTS");
      return true;
    },
  );
  assert.equal(hops, 4);

  hops = 0;
  await assert.rejects(
    () =>
      downloadSignedPackage(
        "https://cdn.example/pkg.okpkg",
        "ab".repeat(32),
        async () => {
          hops += 1;
          return new Response(null, {
            status: 302,
            headers: { location: `https://cdn.example/pkg-${hops}.okpkg` },
          });
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "PACKAGE_TOO_MANY_REDIRECTS");
      return true;
    },
  );
  assert.equal(hops, 4);
});

test("cross-origin packageUrl downloads without the license key and still verifies the digest", async () => {
  const licenseKey = "cdn-package-key-must-not-leak";
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(
    payload({
      component: "enterprise",
      version: "4.0.0",
      fromVersion: "1.0.0",
      summary: "CDN package",
      images: { enterprise: "ghcr.io/okkeyapp/enterprise:4.0.0" },
    }),
    keys.privateKeyPem,
  );
  const raw = JSON.stringify(signed);
  const sha = createHash("sha256").update(raw).digest("hex");
  const seen: Array<{ host: string; licenseHeader: string | null }> = [];

  const downloaded = await downloadSignedPackage(
    "https://cdn.example/enterprise-4.0.0.okpkg",
    sha,
    async (url, init) => {
      const headers = new Headers(init?.headers);
      seen.push({
        host: new URL(String(url)).host,
        licenseHeader: headers.get("X-Okkey-License-Key"),
      });
      return new Response(raw, { status: 200 });
    },
    headersForSameOriginRequest(
      "https://cdn.example/enterprise-4.0.0.okpkg",
      new URL("https://license.example/enterprise.json").origin,
      { "X-Okkey-License-Key": licenseKey },
    ),
  );
  assert.equal(downloaded.payload.version, "4.0.0");
  assert.deepEqual(seen, [{ host: "cdn.example", licenseHeader: null }]);

  const feed = {
    schema: "okkey.update-feed.v1",
    packages: [
      feedPackage("enterprise", "4.0.0", "https://cdn.example/enterprise-4.0.0.okpkg", raw, {
        minCoreVersion: "1.0.0",
      }),
    ],
  };
  const requests: Array<{ host: string; licenseHeader: string | null }> = [];
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "https://license.example/enterprise.json",
    enterpriseLicenseKey: licenseKey,
    isolated: false,
    feedCacheTtlMs: 0,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        host: new URL(String(url)).host,
        licenseHeader: headers.get("X-Okkey-License-Key"),
      });
      if (String(url).includes("license.example")) {
        return new Response(JSON.stringify(feed), { status: 200 });
      }
      if (String(url).includes("cdn.example")) {
        return new Response(raw, { status: 200 });
      }
      return new Response(JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }), {
        status: 200,
      });
    },
    agent: {
      async start() {
        return {
          id: "22222222-2222-4222-8222-222222222222",
          status: "verifying",
          progress: 0,
          component: "enterprise",
          fromVersion: "1.0.0",
          toVersion: "4.0.0",
        };
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => true,
  });
  await service.apply("owner", { source: "feed", component: "enterprise" });
  assert.deepEqual(requests, [
    { host: "license.example", licenseHeader: licenseKey },
    { host: "cdn.example", licenseHeader: null },
  ]);
});

test("feed unauthorized and package download failures use stable error codes", async () => {
  await assert.rejects(
    () =>
      fetchUpdateFeed("https://license.example/feed.json", false, async () => {
        return new Response("denied", { status: 401 });
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "FEED_UNAUTHORIZED");
      return true;
    },
  );

  await assert.rejects(
    () =>
      downloadSignedPackage("https://cdn.example/pkg.okpkg", "ab".repeat(32), async () => {
        return new Response("missing", { status: 404 });
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "PACKAGE_DOWNLOAD_FAILED");
      return true;
    },
  );

  const statusService = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "https://license.example/enterprise.json",
    enterpriseLicenseKey: "status-redirect-key",
    isolated: false,
    feedCacheTtlMs: 0,
    fetchImpl: async (url) => {
      if (String(url).includes("license.example")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://other.example/enterprise.json" },
        });
      }
      return new Response(JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }), {
        status: 200,
      });
    },
    agent: {
      async start() {
        throw new Error("unused");
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => true,
  });
  const status = await statusService.statusFor("owner");
  assert.equal(
    status.components.find((row) => row.component === "enterprise")?.checkError,
    "FEED_REDIRECT_FORBIDDEN",
  );
  assert.equal(JSON.stringify(status).includes("status-redirect-key"), false);
});

test("an expired enterprise license refuses the feed, sets the lapse flag, and a renewal clears both", async () => {
  const licenseKey = "do-not-log-this-license-key";
  let expired = true;
  const headersSeen: Array<string | null> = [];
  const coreFeed = {
    schema: "okkey.update-feed.v1",
    packages: [
      {
        component: "okkey",
        version: "1.1.0",
        fromVersion: "1.0.0",
        summary: "Core",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "http://updates.internal/okkey-1.1.0.okpkg",
        packageSha256: "ab".repeat(32),
      },
    ],
  };
  const enterpriseFeed = {
    schema: "okkey.update-feed.v1",
    packages: [
      {
        component: "enterprise",
        version: "1.2.0",
        fromVersion: "1.0.0",
        summary: "Enterprise",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "http://updates.internal/enterprise-1.2.0.okpkg",
        packageSha256: "cd".repeat(32),
        minCoreVersion: "1.0.0",
      },
    ],
  };
  let lapsed = false;
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://updates.internal/enterprise.json",
    enterpriseLicenseKey: licenseKey,
    enterpriseLicenseLapsed: false,
    setEnterpriseLicenseLapsed: (value) => {
      lapsed = value;
    },
    isolated: false,
    feedCacheTtlMs: 0,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      if (String(url).includes("enterprise")) {
        headersSeen.push(headers.get("X-Okkey-License-Key"));
        if (expired) {
          return new Response(JSON.stringify({ error: "LICENSE_EXPIRED" }), { status: 403 });
        }
        return new Response(JSON.stringify(enterpriseFeed), { status: 200 });
      }
      return new Response(JSON.stringify(coreFeed), { status: 200 });
    },
    agent: {
      async start() {
        throw new Error("apply");
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => true,
  });
  const refused = await service.statusFor("owner");
  assert.equal(lapsed, true);
  assert.equal(refused.enterpriseLicenseLapsed, true);
  assert.equal(
    refused.components.find((row) => row.component === "enterprise")?.checkError,
    "LICENSE_EXPIRED",
  );
  assert.equal(refused.components.find((row) => row.component === "okkey")?.checkError, null);
  assert.equal(JSON.stringify(refused).includes(licenseKey), false);
  assert.deepEqual(headersSeen, [licenseKey]);

  expired = false;
  const renewed = await service.statusFor("owner");
  assert.equal(lapsed, false);
  assert.equal(renewed.enterpriseLicenseLapsed, false);
  assert.equal(renewed.components.find((row) => row.component === "enterprise")?.checkError, null);
  assert.equal(JSON.stringify(renewed).includes(licenseKey), false);
});

test("an invalid enterprise feed does not drop the core update", async () => {
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://updates.internal/enterprise.json",
    isolated: false,
    fetchImpl: async (url: string) => {
      if (url.endsWith("/enterprise.json")) {
        return new Response(JSON.stringify({ schema: "other", packages: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          schema: "okkey.update-feed.v1",
          packages: [
            {
              component: "okkey",
              version: "1.2.0",
              fromVersion: "1.0.0",
              summary: "Core",
              releasedAt: "2026-11-01T00:00:00.000Z",
              packageUrl: "http://updates.internal/okkey-1.2.0.okpkg",
              packageSha256: "ab".repeat(32),
            },
          ],
        }),
        { status: 200 },
      );
    },
    agent: {
      async start() {
        throw new Error("no");
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => true,
  });
  const status = await service.statusFor("owner");
  assert.equal(status.feedError, null);
  assert.equal(status.updates[0]?.toVersion, "1.2.0");
  assert.equal(status.components.find((row) => row.component === "enterprise")?.checkError, "FEED_INVALID");
});

test("enterprise feed pull credentials go to the update agent and not to the browser", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(
    payload({
      component: "enterprise",
      version: "3.0.0",
      fromVersion: "1.0.0",
      summary: "Enterprise module",
      images: { enterprise: "ghcr.io/okkeyapp/enterprise:3.0.0" },
    }),
    keys.privateKeyPem,
  );
  const raw = JSON.stringify(signed);
  const password = "pull-secret-value";
  const username = "pull-user";
  const server = "registry.example";
  const feed = {
    schema: "okkey.update-feed.v1",
    registryCredentials: {
      server: "https://Fallback.Example/v2/",
      username: "fallback-user",
      password: "fallback-secret",
    },
    packages: [
      {
        ...feedPackage("enterprise", "3.0.0", "http://updates.internal/enterprise-3.0.0.okpkg", raw, {
          minCoreVersion: "1.1.0",
        }),
        registryCredentials: { server, username, password },
      },
    ],
  };
  const started: Array<{ document: unknown; options?: { registryCredentials?: { password?: string } } }> = [];
  const agent: UpdateAgentClient = {
    async start(document, options) {
      started.push({ document, options });
      return {
        id: "11111111-1111-4111-8111-111111111111",
        status: "verifying",
        progress: 0,
        component: "enterprise",
        fromVersion: "1.0.0",
        toVersion: "3.0.0",
      };
    },
    async get() {
      return null;
    },
  };
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    enterpriseFeedUrl: "http://updates.internal/enterprise.json",
    isolated: false,
    fetchImpl: async (url: string) => {
      if (url.endsWith("/enterprise.json")) {
        return new Response(JSON.stringify(feed), { status: 200 });
      }
      if (url.endsWith("/enterprise-3.0.0.okpkg")) {
        return new Response(raw, { status: 200 });
      }
      return new Response(JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }), { status: 200 });
    },
    agent,
    isAdmin: async () => true,
  });
  const status = await service.statusFor("owner");
  const statusJson = JSON.stringify(status);
  assert.equal(statusJson.includes(password), false);
  assert.equal(statusJson.includes(username), false);
  assert.equal(statusJson.includes("fallback-secret"), false);
  await service.apply("owner", { source: "feed", component: "enterprise" });
  assert.equal(started.length, 1);
  assert.equal(JSON.stringify(started[0]?.document).includes(password), false);
  assert.deepEqual(started[0]?.options?.registryCredentials, { server, username, password });

  const coreStarted: unknown[] = [];
  const coreRaw = JSON.stringify(signOfflinePackage(payload(), keys.privateKeyPem));
  const core = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: "http://updates.internal/feed.json",
    isolated: false,
    fetchImpl: async (url: string) => {
      if (url.endsWith("/okkey.okpkg")) {
        return new Response(coreRaw, { status: 200 });
      }
      return new Response(
        JSON.stringify({
          schema: "okkey.update-feed.v1",
          registryCredentials: { server, username, password },
          packages: [feedPackage("okkey", "1.1.0", "http://updates.internal/okkey.okpkg", coreRaw)],
        }),
        { status: 200 },
      );
    },
    agent: {
      async start(document, options) {
        coreStarted.push(options ?? null);
        return {
          id: "22222222-2222-4222-8222-222222222222",
          status: "verifying",
          progress: 0,
          component: document.payload.component,
          fromVersion: "1.0.0",
          toVersion: "1.1.0",
        };
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => true,
  });
  await core.apply("owner", { source: "feed", component: "okkey" });
  assert.deepEqual(coreStarted, [null]);

  const posted: string[] = [];
  const client = createHttpUpdateAgentClient({
    baseUrl: "http://agent.internal",
    token: "agent-token",
    fetchImpl: async (_url, init) => {
      posted.push(String(init?.body ?? ""));
      return new Response(
        JSON.stringify({
          error: "APPLY_FAILED",
          message: `registry rejected ${password} for ${username}`,
        }),
        { status: 502 },
      );
    },
  });
  await assert.rejects(
    () => client.start(signed, { registryCredentials: { server, username, password } }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.message.includes(password), false);
      assert.equal(error.message.includes(username), false);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
  assert.equal(posted[0]?.includes(password), true);
  assert.equal(posted.some((body) => body.includes("console")), false);

  assert.throws(
    () =>
      parseUpdateFeed({
        schema: "okkey.update-feed.v1",
        packages: [],
        registryCredentials: { server, username, password: `${password}\n` },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "FEED_INVALID");
      assert.equal(error.message.includes(password), false);
      assert.equal(error.message, "Registry credentials are incomplete");
      return true;
    },
  );
});

function feedPackage(
  component: "okkey" | "enterprise",
  version: string,
  packageUrl: string,
  raw: string,
  extra: { minCoreVersion?: string; releaseNotesUrl?: string } = {},
) {
  return {
    component,
    version,
    fromVersion: "1.0.0",
    summary: component,
    releasedAt: "2026-11-01T00:00:00.000Z",
    packageUrl,
    packageSha256: createHash("sha256").update(raw).digest("hex"),
    ...extra,
  };
}

test("dismiss hides the current version and returns for a newer one", async () => {
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: "",
    isolated: true,
    agent: { async start() { throw new Error("no"); }, async get() { return null; } },
    isAdmin: async () => true,
  });
  await service.dismiss("owner", "okkey", "1.1.0");
  const status = await service.statusFor("owner");
  assert.equal(status.dismissed.okkey, "1.1.0");
  const current = {
    component: "okkey" as const,
    fromVersion: "1.0.0",
    toVersion: "1.1.0",
    summary: "Security fixes",
    releasedAt: "2026-11-01T00:00:00.000Z",
    source: "feed" as const,
    minCoreVersion: null,
    releaseNotesUrl: null,
  };
  assert.equal(visibleUpdates([current], status.dismissed).length, 0);
  assert.equal(
    visibleUpdates([{ ...current, toVersion: "1.2.0" }], status.dismissed).length,
    1,
  );
});

test("update feed is checked once a day and isolated mode does not call out", async () => {
  let now = 1_700_000_000_000;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ schema: "okkey.update-feed.v1", packages: [] }),
      { status: 200 },
    );
  };
  const agent = {
    async start(): Promise<UpdateJob> {
      throw new Error("no");
    },
    async get(): Promise<UpdateJob | null> {
      return null;
    },
  };
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0-beta.3",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: "http://updates.internal/feed.json",
    isolated: false,
    fetchImpl,
    now: () => now,
    agent,
    isAdmin: async () => true,
  });
  await service.statusFor("owner");
  await service.statusFor("owner");
  assert.equal(calls, 1);
  now += 24 * 60 * 60 * 1000 - 1;
  await service.statusFor("owner");
  assert.equal(calls, 1);
  now += 1;
  await service.statusFor("owner");
  assert.equal(calls, 2);

  let isolatedCalls = 0;
  const isolated = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0-beta.3",
    commitSha: "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: "http://updates.internal/feed.json",
    isolated: true,
    fetchImpl: async () => {
      isolatedCalls += 1;
      throw new Error("should not fetch");
    },
    agent,
    isAdmin: async () => false,
  });
  const status = await isolated.statusFor("member");
  assert.equal(isolatedCalls, 0);
  assert.equal(status.isolated, true);
  assert.equal(status.updates.length, 0);
  assert.equal(status.commitSha, "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560");
  assert.equal(status.feedError, null);
});

test("opening a version records seen and an older version does not replace it", async () => {
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0-beta.3",
    releaseTag: "v1.0.0-beta.3",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: "",
    isolated: true,
    agent: {
      async start(): Promise<UpdateJob> {
        throw new Error("no");
      },
      async get(): Promise<UpdateJob | null> {
        return null;
      },
    },
    isAdmin: async () => false,
  });
  await service.markSeen("member", "okkey", "1.1.0");
  await service.markSeen("member", "enterprise", "2.0.0");
  const seen = await service.statusFor("member");
  assert.equal(seen.seen.okkey, "1.1.0");
  assert.equal(seen.seen.enterprise, "2.0.0");
  assert.equal(seen.releaseTag, "v1.0.0-beta.3");
  assert.equal(seen.dismissed.okkey, undefined);

  await service.markSeen("member", "okkey", "1.0.0");
  const same = await service.statusFor("member");
  assert.equal(same.seen.okkey, "1.1.0");

  await service.markSeen("member", "okkey", "1.2.0");
  const newer = await service.statusFor("member");
  assert.equal(newer.seen.okkey, "1.2.0");

  const app = appWithRoutes("self_hosted", service);
  const denied = await dispatch(app, {
    method: "POST",
    url: "/system/updates/seen",
    body: { component: "okkey", version: "9.0.0" },
  });
  assert.equal(denied.status, 401);
  const recorded = await dispatch(app, {
    method: "POST",
    url: "/system/updates/seen",
    headers: { "x-user-id": "member" },
    body: { component: "okkey", version: "1.3.0" },
  });
  assert.equal(recorded.status, 200);
  assert.equal((await service.statusFor("member")).seen.okkey, "1.3.0");
});

test("saas update routes are hidden and do not check the feed", async () => {
  let statusCalls = 0;
  const app = appWithRoutes("saas", {
    async statusFor() {
      statusCalls += 1;
      throw new Error("should not check");
    },
    async userCanApply() {
      return true;
    },
    async dismiss() {},
    async apply() {
      throw new Error("should not apply");
    },
    async job() {
      return null;
    },
  });
  const response = await dispatch(app, { method: "GET", url: "/system/updates", headers: { "x-user-id": "owner" } });
  assert.equal(response.status, 404);
  assert.equal(statusCalls, 0);
});

test("apply is not started by a status check", async () => {
  let started = 0;
  const job: UpdateJob = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "verifying",
    progress: 10,
    component: "okkey",
    fromVersion: "1.0.0",
    toVersion: "1.1.0",
  };
  const app = appWithRoutes("self_hosted", {
    async statusFor() {
      return {
        deploymentMode: "self_hosted" as const,
        currentVersion: "1.0.0",
        enterpriseInstalled: false,
        enterpriseVersion: null,
        feedConfigured: false,
        isolated: false,
        canApply: true,
        updates: [],
        dismissed: {},
        feedError: null,
      };
    },
    async userCanApply() {
      return true;
    },
    async dismiss() {},
    async apply() {
      started += 1;
      return job;
    },
    async job() {
      return job;
    },
  });
  const status = await dispatch(app, { method: "GET", url: "/system/updates", headers: { "x-user-id": "owner" } });
  assert.equal(status.status, 200);
  assert.equal(started, 0);
  const applied = await dispatch(app, {
    method: "POST",
    url: "/system/updates/apply",
    headers: { "x-user-id": "owner" },
    body: { source: "file", document: { payload: {}, signature: "abc" } },
  });
  assert.equal(applied.status, 202);
  assert.equal(started, 1);
});

test("POST /system/updates/apply rejects a body over the shared offline limit", async () => {
  let started = 0;
  const app = appWithRoutes("self_hosted", {
    async statusFor() {
      return {
        deploymentMode: "self_hosted" as const,
        currentVersion: "1.0.0",
        enterpriseInstalled: false,
        enterpriseVersion: null,
        feedConfigured: false,
        isolated: false,
        canApply: true,
        updates: [],
        dismissed: {},
        feedError: null,
      };
    },
    async userCanApply() {
      return true;
    },
    async dismiss() {},
    async apply() {
      started += 1;
      throw new Error("apply should not run");
    },
    async job() {
      return null;
    },
  });
  const oversized = JSON.stringify({
    source: "file",
    document: {
      format: "okkey-offline-bundle",
      formatVersion: 1,
      archiveBase64: "A".repeat(BUNDLE_MAX_APPLY_BODY_BYTES),
    },
  });
  assert.ok(Buffer.byteLength(oversized) > BUNDLE_MAX_APPLY_BODY_BYTES);
  const applied = await dispatch(app, {
    method: "POST",
    url: "/system/updates/apply",
    headers: { "x-user-id": "owner" },
    body: oversized,
  });
  assert.equal(applied.status, 400);
  assert.equal((applied.body as { error?: string }).error, "PACKAGE_TOO_LARGE");
  assert.equal(started, 0);
});

test("update agent refuses a body over the shared document limit", async () => {
  const keys = generateUpdateKeyPair();
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: keys.publicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine: recordingEngine(calls),
  });
  const oversized = {
    format: "okkey-offline-bundle",
    formatVersion: 1,
    archiveBase64: "A".repeat(BUNDLE_MAX_DOCUMENT_BYTES),
  };
  const response = new MockResponse();
  await agent.handler(fakeRequest(oversized), response as unknown as ServerResponse);
  assert.equal(response.statusCode, 400);
  const body = JSON.parse(response.body) as { error?: string };
  assert.equal(body.error, "PACKAGE_TOO_LARGE");
  assert.deepEqual(calls, []);
});

test("update agent refuses a missing, invalid, or interrupted signature without applying", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(payload(), keys.privateKeyPem);
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
  const calls: string[] = [];
  const engine = recordingEngine(calls);
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: keys.publicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine,
  });

  const missing = await postJob(agent, { payload: signed.payload });
  await agent.settle();
  assert.equal(missing.job.errorCode, "SIGNATURE_MISSING");
  assert.deepEqual(calls, []);

  const bad = await postJob(agent, { ...signed, signature: Buffer.from("nope").toString("base64") });
  await agent.settle();
  assert.equal(bad.job.errorCode, "SIGNATURE_INVALID");
  assert.deepEqual(calls, []);

  const interrupted = createUpdateAgent({
    token: "secret",
    publicKeyPem: keys.publicKeyPem,
    isolated: true,
    project: "okkey",
    envFilePath: envFile,
    engine,
    verify() {
      throw new Error("verification process stopped");
    },
  });
  const stopped = await postJob(interrupted, signed);
  await interrupted.settle();
  assert.equal(stopped.job.errorCode, "VERIFICATION_INTERRUPTED");
  assert.equal(readFileSync(envFile, "utf8"), "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
  assert.deepEqual(calls, []);
});

test("update agent verifies a signature before apply and does not use the core key for enterprise", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(payload(), keys.privateKeyPem);
  verifyOfflinePackage(signed, keys.publicKeyPem);
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: keys.publicKeyPem,
    isolated: true,
    project: "okkey",
    envFilePath: envFile,
    engine: recordingEngine(calls, { exists: true }),
  });
  const ok = await postJob(agent, signed);
  await agent.settle();
  assert.equal(ok.job.status, "succeeded");
  assert.deepEqual(ok.job.result, { scope: "core", coreVersion: "1.1.0" });
  assert.equal(calls.includes("pull"), false);
  assert.equal(calls.filter((call) => call.startsWith("replace")).length, 3);
  const coreEnv = readFileSync(envFile, "utf8");
  assert.match(coreEnv, /OKKEY_IMAGE_TAG=1\.1\.0/);
  assert.match(coreEnv, /OKKEY_API_IMAGE=ghcr\.io\/okkeyapp\/api/);
  assert.match(coreEnv, /OKKEY_WEB_IMAGE=ghcr\.io\/okkeyapp\/web/);
  assert.match(coreEnv, /OKKEY_WORKER_IMAGE=ghcr\.io\/okkeyapp\/worker/);
  assert.equal(coreEnv.includes("OKKEY_ENTERPRISE_IMAGE_TAG="), false);
  assert.equal(coreEnv.includes("OKKEY_ENTERPRISE_VERSION="), false);

  calls.length = 0;
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
  const enterprise = signOfflinePackage(enterprisePayload(), keys.privateKeyPem);
  const skipped = await postJob(agent, enterprise);
  await agent.settle();
  assert.equal(skipped.job.errorCode, "TRUST_KEY_MISSING");
  assert.deepEqual(calls, []);
  assert.equal(readFileSync(envFile, "utf8"), "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
});

test("a failed core apply restores replaced services and does not rewrite the image tag", async () => {
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
  const rolled: string[] = [];
  let replaced = 0;
  const engine: UpdateApplyEngine = {
    async pullImage() {},
    async imageExists() {
      return true;
    },
    async findServiceContainer(_project, service) {
      return { id: service, name: service, service, image: "old" };
    },
    async replaceContainer(container) {
      replaced += 1;
      if (container.service === "web") {
        throw new Error("start failed");
      }
      return {
        async rollback() {
          rolled.push(container.service);
        },
        async commit() {},
      };
    },
    async readEnvFile() {
      return readFileSync(envFile, "utf8");
    },
    async writeEnvFile() {
      throw new Error("env must stay unchanged");
    },
  };
  await assert.rejects(
    () =>
      applyVerifiedCorePackage({
        payload: payload(),
        engine,
        project: "okkey",
        envFilePath: envFile,
        isolated: true,
      }),
    /start failed/,
  );
  assert.deepEqual(rolled, ["api"]);
  assert.equal(replaced, 2);
  assert.equal(readFileSync(envFile, "utf8"), "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
});

test("docker apply talks to the engine socket and rolls back a failed create", async () => {
  const calls: string[] = [];
  const transport: DockerTransport = async (method, requestPath, body) => {
    calls.push(`${method} ${requestPath}`);
    if (requestPath === "/_ping") {
      return {
        status: 200,
        body: "OK",
        headers: { "Api-Version": "1.43", MinAPIVersion: "1.24" },
      };
    }
    if (requestPath.startsWith("/v1.43/images/create")) {
      return { status: 200, body: "" };
    }
    if (requestPath.startsWith("/v1.43/images/") && requestPath.endsWith("/json")) {
      return {
        status: 200,
        body: JSON.stringify({
          Config: {
            Env: ["PATH=/usr/bin", "OKKEY_GIT_SHA=old"],
            WorkingDir: "/app",
            User: "",
            Cmd: ["node", "index.js"],
            Entrypoint: null,
          },
        }),
      };
    }
    if (requestPath.includes("/containers/create")) {
      assert.match(body ?? "", /ghcr.io\/okkeyapp\/api:1.1.0/);
      return { status: 500, body: "no" };
    }
    if (requestPath.includes("/containers/") && requestPath.includes("/json")) {
      return {
        status: 200,
        body: JSON.stringify({
          Id: "old",
          Name: "/okkey-api-1",
          Image: "sha256:oldimage",
          Config: { Env: ["PATH=/usr/bin", "OKKEY_GIT_SHA=old", "OKKEY_VERSION=1.0.0"], Labels: {} },
          HostConfig: { Binds: ["/data:/data"], PortBindings: {} },
          NetworkSettings: { Networks: { okkey_default: { Aliases: ["api"] } } },
        }),
      };
    }
    return { status: 204, body: "" };
  };
  const engine = createDockerApplyEngine(transport);
  await assert.rejects(
    () =>
      engine.replaceContainer(
        { id: "old", name: "okkey-api-1", service: "api", image: "old" },
        "ghcr.io/okkeyapp/api:1.1.0",
        { OKKEY_VERSION: "1.1.0" },
      ),
    /could not create/,
  );
  assert.ok(calls.some((call) => call.includes("/rename?name=okkey-api-1-okkey-prev")));
  assert.ok(calls.some((call) => call.includes("/rename?name=okkey-api-1")));
  assert.ok(calls.some((call) => call.endsWith("/start")));
});

test("update agent applies an enterprise package and keeps registry credentials out of logs", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const password = "pull-token-not-a-pat-9f3c";
  const username = "okkey-pull-user";
  const signed = signOfflinePackage(enterprisePayload(), enterpriseKeys.privateKeyPem);
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  const originalEnv = "OKKEY_IMAGE_TAG=1.4.0\nOKKEY_ENTERPRISE_IMAGE_TAG=1.0.0\n";
  writeFileSync(envFile, originalEnv);
  const calls: string[] = [];
  const pulled: Array<{ image: string; password?: string }> = [];
  const logs: string[] = [];
  const restoreLogs = captureLogs(logs);
  try {
    const agent = createUpdateAgent({
      token: "secret",
      publicKeyPem: coreKeys.publicKeyPem,
      enterprisePublicKeyPem: enterpriseKeys.publicKeyPem,
      isolated: false,
      project: "okkey",
      envFilePath: envFile,
      engine: {
        ...recordingEngine(calls, { exists: true }),
        async pullImage(image: string, credentials?: { password?: string }) {
          calls.push("pull");
          pulled.push({ image, password: credentials?.password });
        },
        async replaceContainer(container: { service: string }, _image: string, _env: Record<string, string>, options?: { requireHealthy?: boolean }) {
          calls.push(`replace:${container.service}`);
          assert.equal(options?.requireHealthy, true);
          return {
            async rollback() {
              calls.push(`rollback:${container.service}`);
            },
            async commit() {
              calls.push(`commit:${container.service}`);
            },
          };
        },
      },
    });
    const finished = await postJob(agent, {
      ...signed,
      registryCredentials: { server: "ghcr.io", username, password },
    });
    await agent.settle();
    assert.equal(finished.job.status, "succeeded");
    assert.equal(finished.job.component, "enterprise");
    assert.equal(finished.job.toVersion, "2.0.0");
    assert.deepEqual(finished.job.result, { scope: "enterprise", enterpriseVersion: "2.0.0" });
    assert.deepEqual(
      pulled.map((item) => item.image),
      [
        "ghcr.io/example/enterprise-api:2.0.0",
        "ghcr.io/example/enterprise-web:2.0.0",
        "ghcr.io/example/enterprise-worker:2.0.0",
      ],
    );
    assert.deepEqual(pulled.map((item) => item.password), [password, password, password]);
    assert.equal(calls.filter((call) => call.startsWith("commit:")).length, 3);
    const env = readFileSync(envFile, "utf8");
    assert.match(env, /OKKEY_IMAGE_TAG=1\.4\.0/);
    assert.match(env, /OKKEY_ENTERPRISE_IMAGE_TAG=2\.0\.0/);
    assert.match(env, /OKKEY_ENTERPRISE_VERSION=2\.0\.0/);
    assert.match(env, /OKKEY_API_IMAGE=ghcr\.io\/example\/enterprise-api/);
    assert.match(env, /OKKEY_WEB_IMAGE=ghcr\.io\/example\/enterprise-web/);
    assert.match(env, /OKKEY_WORKER_IMAGE=ghcr\.io\/example\/enterprise-worker/);
    assert.equal(env.includes("OKKEY_ENTERPRISE_API_IMAGE="), false);
    assert.deepEqual(
      calls.filter((call) => call.startsWith("find:")),
      ["find:api", "find:web", "find:worker"],
    );
    assert.deepEqual(
      calls.filter((call) => call.startsWith("replace:")),
      ["replace:api", "replace:web", "replace:worker"],
    );
    assertNoCredentialLeak(logs.join("\n") + env, password);
  } finally {
    restoreLogs();
  }
});

test("update agent rolls enterprise tags back when a pull fails", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(enterprisePayload(), keys.privateKeyPem);
  const password = "pull-token-not-a-pat-9f3c";
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  const originalEnv = "OKKEY_IMAGE_TAG=1.4.0\nOKKEY_ENTERPRISE_IMAGE_TAG=1.0.0\n";
  writeFileSync(envFile, originalEnv);
  const calls: string[] = [];
  let tagDuringPull = "";
  const logs: string[] = [];
  const restoreLogs = captureLogs(logs);
  try {
    const agent = createUpdateAgent({
      token: "secret",
      publicKeyPem: generateUpdateKeyPair().publicKeyPem,
      enterprisePublicKeyPem: keys.publicKeyPem,
      isolated: false,
      project: "okkey",
      envFilePath: envFile,
      engine: {
        ...recordingEngine(calls),
        async pullImage() {
          tagDuringPull = readFileSync(envFile, "utf8");
          calls.push("pull");
          throw new Error(`registry pull failed ${password}`);
        },
      },
    });
    const finished = await postJob(agent, {
      ...signed,
      registryCredentials: { server: "ghcr.io", username: "okkey-pull", password },
    });
    await agent.settle();
    assert.equal(finished.job.errorCode, "APPLY_FAILED");
    assert.match(finished.job.errorMessage ?? "", /previous version was restored/);
    assert.match(finished.job.errorMessage ?? "", /\[redacted\]/);
    assert.match(tagDuringPull, /OKKEY_ENTERPRISE_IMAGE_TAG=2\.0\.0/);
    assert.equal(readFileSync(envFile, "utf8"), originalEnv);
    assert.equal(calls.some((call) => call.startsWith("replace")), false);
    assertNoCredentialLeak(`${logs.join("\n")}\n${finished.job.errorMessage ?? ""}\n${readFileSync(envFile, "utf8")}`, password);
  } finally {
    restoreLogs();
  }
});

test("update agent rolls enterprise containers and tags back when health fails", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(enterprisePayload(), keys.privateKeyPem);
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  const originalEnv = "OKKEY_IMAGE_TAG=1.4.0\nOKKEY_ENTERPRISE_IMAGE_TAG=1.0.0\n";
  writeFileSync(envFile, originalEnv);
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: generateUpdateKeyPair().publicKeyPem,
    enterprisePublicKeyPem: keys.publicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine: {
      ...recordingEngine(calls),
      async pullImage() {
        calls.push("pull");
      },
      async replaceContainer(container: { service: string }) {
        calls.push(`replace:${container.service}`);
        if (container.service === "web") {
          throw new Error("health failed");
        }
        return {
          async rollback() {
            calls.push(`rollback:${container.service}`);
          },
          async commit() {
            calls.push(`commit:${container.service}`);
          },
        };
      },
    },
  });
  const finished = await postJob(agent, signed);
  await agent.settle();
  assert.equal(finished.job.errorCode, "APPLY_FAILED");
  assert.match(finished.job.errorMessage ?? "", /previous version was restored/);
  assert.ok(calls.includes("rollback:api"));
  assert.equal(calls.some((call) => call.startsWith("commit:")), false);
  assert.equal(readFileSync(envFile, "utf8"), originalEnv);
});

test("update agent refuses an enterprise package when the running core is too old", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(enterprisePayload({ minCoreVersion: "1.2.0" }), keys.privateKeyPem);
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  const originalEnv = "OKKEY_IMAGE_TAG=1.0.0\nOKKEY_ENTERPRISE_IMAGE_TAG=1.0.0\n";
  writeFileSync(envFile, originalEnv);
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: generateUpdateKeyPair().publicKeyPem,
    enterprisePublicKeyPem: keys.publicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine: recordingEngine(calls),
  });
  const finished = await postJob(agent, signed);
  await agent.settle();
  assert.equal(finished.job.errorCode, "CORE_UPDATE_REQUIRED");
  assert.match(finished.job.errorMessage ?? "", /Update core first/);
  assert.match(finished.job.errorMessage ?? "", /Nothing was changed/);
  assert.deepEqual(calls, []);
  assert.equal(readFileSync(envFile, "utf8"), originalEnv);

  const running = createUpdateAgent({
    token: "secret",
    publicKeyPem: generateUpdateKeyPair().publicKeyPem,
    enterprisePublicKeyPem: keys.publicKeyPem,
    isolated: true,
    project: "okkey",
    envFilePath: envFile,
    coreVersion: "9.0.0",
    engine: {
      ...recordingEngine([]),
      async readRunningCoreVersion() {
        return "1.0.0";
      },
    },
  });
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=9.0.0\n");
  const fromContainer = await postJob(running, signed);
  await running.settle();
  assert.equal(fromContainer.job.errorCode, "CORE_UPDATE_REQUIRED");
  assert.equal(readFileSync(envFile, "utf8"), "OKKEY_IMAGE_TAG=9.0.0\n");
});

test("update agent rejects a package signed with the other component key", async () => {
  const coreKeys = generateUpdateKeyPair();
  const enterpriseKeys = generateUpdateKeyPair();
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.4.0\n");
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: coreKeys.publicKeyPem,
    enterprisePublicKeyPem: enterpriseKeys.publicKeyPem,
    isolated: false,
    project: "okkey",
    envFilePath: envFile,
    engine: recordingEngine(calls),
  });

  const enterpriseSignedWithCore = signOfflinePackage(enterprisePayload(), coreKeys.privateKeyPem);
  const enterpriseRejected = await postJob(agent, enterpriseSignedWithCore);
  await agent.settle();
  assert.equal(enterpriseRejected.job.errorCode, "SIGNATURE_INVALID");

  const coreSignedWithEnterprise = signOfflinePackage(payload(), enterpriseKeys.privateKeyPem);
  const coreRejected = await postJob(agent, coreSignedWithEnterprise);
  await agent.settle();
  assert.equal(coreRejected.job.errorCode, "SIGNATURE_INVALID");
  assert.deepEqual(calls, []);
  assert.equal(readFileSync(envFile, "utf8"), "OKKEY_IMAGE_TAG=1.4.0\n");
});

test("feed apply forwards enterprise pull credentials and omits them from status", async () => {
  const password = "feed-pull-token-not-a-pat";
  const coreSigned = signOfflinePackage(payload({ version: "1.5.0", imageTag: "1.5.0" }), generateUpdateKeyPair().privateKeyPem);
  const enterpriseSigned = signOfflinePackage(enterprisePayload(), generateUpdateKeyPair().privateKeyPem);
  const coreRaw = JSON.stringify(coreSigned);
  const enterpriseRaw = JSON.stringify(enterpriseSigned);
  const credentials = { server: "ghcr.io", username: "okkey-pull", password };
  const feed = {
    schema: "okkey.update-feed.v1",
    registryCredentials: credentials,
    packages: [
      {
        component: "okkey",
        version: "1.5.0",
        fromVersion: "1.4.0",
        summary: "Core",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "http://updates.internal/okkey-1.5.0.okpkg",
        packageSha256: createHash("sha256").update(coreRaw).digest("hex"),
      },
      {
        component: "enterprise",
        version: "2.0.0",
        fromVersion: "1.0.0",
        summary: "Enterprise module",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "http://updates.internal/enterprise-2.0.0.okpkg",
        packageSha256: createHash("sha256").update(enterpriseRaw).digest("hex"),
      },
    ],
  };
  const fetchImpl = async (url: string) => {
    if (url.endsWith("enterprise-2.0.0.okpkg")) {
      return new Response(enterpriseRaw, { status: 200 });
    }
    if (url.endsWith("okkey-1.5.0.okpkg")) {
      return new Response(coreRaw, { status: 200 });
    }
    return new Response(JSON.stringify(feed), { status: 200 });
  };
  const forwarded: unknown[] = [];
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.4.0",
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    coreFeedUrl: "http://updates.internal/feed.json",
    isolated: false,
    fetchImpl,
    agent: {
      async start(_document, options) {
        forwarded.push(options?.registryCredentials ?? null);
        return {
          id: "11111111-1111-4111-8111-111111111111",
          status: "verifying",
          progress: 5,
          component: "okkey",
          fromVersion: "1.4.0",
          toVersion: "1.5.0",
        };
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => true,
  });
  const status = await service.statusFor("owner");
  assertNoCredentialLeak(JSON.stringify(status), password);
  await service.apply("owner", { source: "feed", component: "okkey" });
  await service.apply("owner", { source: "feed", component: "enterprise" });
  assert.deepEqual(forwarded, [null, credentials]);
});

test("docker pull sends registry credentials only to the matching registry", async () => {
  const password = "pull-token-not-a-pat-9f3c";
  const headersSeen: Array<Record<string, string> | undefined> = [];
  const logs: string[] = [];
  const restoreLogs = captureLogs(logs);
  try {
    const transport: DockerTransport = async (_method, requestPath, _body, headers) => {
      if (requestPath === "/_ping") {
        return {
          status: 200,
          body: "OK",
          headers: { "Api-Version": "1.43", MinAPIVersion: "1.24" },
        };
      }
      headersSeen.push(headers);
      return { status: 200, body: "" };
    };
    const engine = createDockerApplyEngine(transport);
    const credentials = { server: "ghcr.io", username: "okkey-pull", password };
    await engine.pullImage("ghcr.io/example/enterprise-api:2.0.0", credentials);
    await engine.pullImage("quay.io/example/enterprise-api:2.0.0", credentials);
    const header = headersSeen[0]?.["X-Registry-Auth"] ?? "";
    assert.ok(header.length > 0);
    assert.equal(headersSeen[1]?.["X-Registry-Auth"], undefined);
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { password?: string };
    assert.equal(decoded.password, password);
    assertNoCredentialLeak(logs.join("\n"), password);
    assert.equal(logs.join("\n").includes(header), false);
  } finally {
    restoreLogs();
  }
});

test("docker apply rolls back when the new enterprise container does not become healthy", async () => {
  const calls: string[] = [];
  let inspects = 0;
  const transport: DockerTransport = async (method, requestPath) => {
    calls.push(`${method} ${requestPath}`);
    if (requestPath === "/_ping") {
      return {
        status: 200,
        body: "OK",
        headers: { "Api-Version": "1.43", MinAPIVersion: "1.24" },
      };
    }
    if (requestPath.startsWith("/v1.43/images/") && requestPath.endsWith("/json")) {
      return {
        status: 200,
        body: JSON.stringify({
          Config: {
            Env: ["PATH=/usr/bin"],
            WorkingDir: "/okkey",
            User: "nonroot",
            Entrypoint: ["sh", "-c"],
            Cmd: ["sleep infinity"],
            Healthcheck: { Test: ["CMD-SHELL", "exit 0"] },
          },
        }),
      };
    }
    if (requestPath.includes("/containers/create")) {
      return { status: 201, body: JSON.stringify({ Id: "new-id" }) };
    }
    if (requestPath.includes("/containers/old/json")) {
      return {
        status: 200,
        body: JSON.stringify({
          Id: "old",
          Name: "/okkey-api-1",
          Image: "sha256:oldimage",
          Config: { Env: ["PATH=/usr/bin", "OKKEY_ENTERPRISE_VERSION=1.0.0"], Labels: {} },
          HostConfig: {},
          NetworkSettings: { Networks: {} },
        }),
      };
    }
    if (requestPath.includes("/containers/new-id/json")) {
      inspects += 1;
      return {
        status: 200,
        body: JSON.stringify({ State: { Running: true, Health: { Status: "unhealthy" } } }),
      };
    }
    return { status: 204, body: "" };
  };
  const engine = createDockerApplyEngine(transport);
  await assert.rejects(
    () =>
      engine.replaceContainer(
        { id: "old", name: "okkey-api-1", service: "api", image: "old" },
        "ghcr.io/example/enterprise-api:2.0.0",
        { OKKEY_ENTERPRISE_VERSION: "2.0.0" },
        { requireHealthy: true },
      ),
    /did not become healthy/,
  );
  assert.equal(inspects, 1);
  assert.ok(calls.some((call) => call.includes("DELETE") && call.includes("new-id")));
  assert.ok(calls.some((call) => call.includes("/rename?name=okkey-api-1") && !call.includes("okkey-prev")));
  assert.ok(calls.some((call) => call.endsWith("/old/start")));
});

test("userProvidedEnv keeps only compose overrides against the old image", () => {
  assert.deepEqual(
    userProvidedEnv(
      [
        "PATH=/usr/bin",
        "OKKEY_GIT_SHA=oldsha",
        "DATABASE_URL=postgres://db",
        "OKKEY_VERSION=1.0.0",
      ],
      ["PATH=/usr/bin", "OKKEY_GIT_SHA=oldsha"],
    ),
    {
      DATABASE_URL: "postgres://db",
      OKKEY_VERSION: "1.0.0",
    },
  );
});

test("composeReplaceEnv lets the new image win for image-owned keys", () => {
  const env = composeReplaceEnv({
    newImageEnv: ["PATH=/usr/bin", "OKKEY_GIT_SHA=newsha", "OKKEY_VERSION=image"],
    userEnv: {
      DATABASE_URL: "postgres://db",
      OKKEY_VERSION: "1.0.0",
    },
    updates: { OKKEY_VERSION: "1.1.0", OKKEY_IMAGE_TAG: "1.1.0" },
  });
  assert.deepEqual(env.sort(), [
    "DATABASE_URL=postgres://db",
    "OKKEY_GIT_SHA=newsha",
    "OKKEY_IMAGE_TAG=1.1.0",
    "OKKEY_VERSION=1.1.0",
    "PATH=/usr/bin",
  ]);
});

test("buildReplaceCreateBody takes image config from the new image", () => {
  const body = buildReplaceCreateBody({
    container: {
      Name: "/okkey-api-1",
      Image: "sha256:old",
      Config: {
        Hostname: "api",
        User: "root",
        WorkingDir: "/app",
        Entrypoint: null,
        Cmd: ["node", "services/api/src/index.ts"],
        Env: [
          "PATH=/usr/bin",
          "OKKEY_GIT_SHA=oldsha",
          "DATABASE_URL=postgres://db",
          "OKKEY_VERSION=1.0.0",
        ],
        Labels: { "com.docker.compose.service": "api" },
      },
      HostConfig: {
        Binds: ["/data:/data"],
        PortBindings: { "4000/tcp": [{ HostPort: "4000" }] },
        RestartPolicy: { Name: "unless-stopped" },
      },
      NetworkSettings: { Networks: { okkey_default: { Aliases: ["api"] } } },
    },
    oldImage: {
      Config: {
        User: "root",
        WorkingDir: "/app",
        Env: ["PATH=/usr/bin", "OKKEY_GIT_SHA=oldsha"],
        Cmd: ["node", "services/api/src/index.ts"],
        Entrypoint: null,
      },
    },
    newImage: {
      Config: {
        User: "nonroot",
        WorkingDir: "/okkey",
        Env: ["PATH=/usr/bin", "OKKEY_GIT_SHA=newsha"],
        Cmd: ["node", "dist/index.js"],
        Entrypoint: ["/okkey/entrypoint.sh"],
        Healthcheck: { Test: ["CMD", "curl", "-f", "http://localhost:4000/health"] },
        ExposedPorts: { "4000/tcp": {} },
      },
    },
    imageRef: "ghcr.io/example/enterprise-api:2.0.0",
    envUpdates: { OKKEY_ENTERPRISE_VERSION: "2.0.0" },
  });
  assert.equal(body.User, "nonroot");
  assert.equal(body.WorkingDir, "/okkey");
  assert.deepEqual(body.Entrypoint, ["/okkey/entrypoint.sh"]);
  assert.deepEqual(body.Cmd, ["node", "dist/index.js"]);
  assert.deepEqual(body.Healthcheck, { Test: ["CMD", "curl", "-f", "http://localhost:4000/health"] });
  assert.deepEqual(body.ExposedPorts, { "4000/tcp": {} });
  assert.equal(body.Hostname, "api");
  assert.deepEqual(body.Labels, { "com.docker.compose.service": "api" });
  assert.equal(body.Image, "ghcr.io/example/enterprise-api:2.0.0");
  const env = body.Env as string[];
  assert.ok(env.includes("OKKEY_GIT_SHA=newsha"));
  assert.ok(env.includes("DATABASE_URL=postgres://db"));
  assert.ok(env.includes("OKKEY_ENTERPRISE_VERSION=2.0.0"));
  assert.ok(!env.includes("OKKEY_GIT_SHA=oldsha"));
  assert.deepEqual((body.HostConfig as { Binds?: string[] }).Binds, ["/data:/data"]);
});

test("docker replace creates a body from the new image config", async () => {
  let createBody = "";
  const transport: DockerTransport = async (method, requestPath, body) => {
    if (requestPath === "/_ping") {
      return {
        status: 200,
        body: "OK",
        headers: { "Api-Version": "1.43", MinAPIVersion: "1.24" },
      };
    }
    if (requestPath.startsWith("/v1.43/images/") && requestPath.endsWith("/json")) {
      const isNew = decodeURIComponent(requestPath).includes("enterprise-api:2.0.0");
      return {
        status: 200,
        body: JSON.stringify({
          Config: isNew
            ? {
                User: "nonroot",
                WorkingDir: "/okkey",
                Env: ["PATH=/usr/bin", "OKKEY_GIT_SHA=newsha"],
                Entrypoint: ["/okkey/entrypoint.sh"],
                Cmd: ["node", "dist/index.js"],
                Healthcheck: { Test: ["CMD-SHELL", "exit 0"] },
              }
            : {
                User: "root",
                WorkingDir: "/app",
                Env: ["PATH=/usr/bin", "OKKEY_GIT_SHA=oldsha"],
                Entrypoint: null,
                Cmd: ["node", "services/api/src/index.ts"],
              },
        }),
      };
    }
    if (requestPath.includes("/containers/create")) {
      createBody = body ?? "";
      return { status: 201, body: JSON.stringify({ Id: "new-id" }) };
    }
    if (requestPath.includes("/containers/old/json")) {
      return {
        status: 200,
        body: JSON.stringify({
          Id: "old",
          Name: "/okkey-api-1",
          Image: "sha256:oldimage",
          Config: {
            Hostname: "api",
            Env: [
              "PATH=/usr/bin",
              "OKKEY_GIT_SHA=oldsha",
              "DATABASE_URL=postgres://db",
              "OKKEY_VERSION=1.0.0",
            ],
            Labels: { "com.docker.compose.service": "api" },
            WorkingDir: "/app",
            User: "root",
          },
          HostConfig: { RestartPolicy: { Name: "unless-stopped" } },
          NetworkSettings: { Networks: { okkey_default: { Aliases: ["api"] } } },
        }),
      };
    }
    if (requestPath.includes("/containers/new-id/json")) {
      return {
        status: 200,
        body: JSON.stringify({ State: { Running: true, Health: { Status: "healthy" } } }),
      };
    }
    return { status: 204, body: "" };
  };
  const engine = createDockerApplyEngine(transport);
  const result = await engine.replaceContainer(
    { id: "old", name: "okkey-api-1", service: "api", image: "old" },
    "ghcr.io/example/enterprise-api:2.0.0",
    { OKKEY_ENTERPRISE_VERSION: "2.0.0" },
    { requireHealthy: true },
  );
  const parsed = JSON.parse(createBody) as {
    User?: string;
    WorkingDir?: string;
    Entrypoint?: string[];
    Env?: string[];
  };
  assert.equal(parsed.User, "nonroot");
  assert.equal(parsed.WorkingDir, "/okkey");
  assert.deepEqual(parsed.Entrypoint, ["/okkey/entrypoint.sh"]);
  assert.ok(parsed.Env?.includes("OKKEY_GIT_SHA=newsha"));
  assert.ok(parsed.Env?.includes("DATABASE_URL=postgres://db"));
  await result.commit();
});

test("running core version is read from the api container", async () => {
  const transport: DockerTransport = async (_method, requestPath) => {
    if (requestPath === "/_ping") {
      return {
        status: 200,
        body: "OK",
        headers: { "Api-Version": "1.43", MinAPIVersion: "1.24" },
      };
    }
    if (requestPath.includes("/containers/json")) {
      return {
        status: 200,
        body: JSON.stringify([{ Id: "api-id", Names: ["/okkey-api-1"], Image: "api:old" }]),
      };
    }
    if (requestPath.includes("/containers/api-id/json")) {
      return {
        status: 200,
        body: JSON.stringify({ Config: { Env: ["OKKEY_VERSION=1.4.0"] } }),
      };
    }
    return { status: 404, body: "" };
  };
  const engine = createDockerApplyEngine(transport);
  assert.equal(await engine.readRunningCoreVersion?.("okkey"), "1.4.0");
});

test("setEnvValue replaces the image tag without dropping other keys", () => {
  assert.equal(
    setEnvValue("OKKEY_IMAGE_TAG=1.0.0\nPOSTGRES_PASSWORD=secret\n", "OKKEY_IMAGE_TAG", "1.1.0"),
    "OKKEY_IMAGE_TAG=1.1.0\nPOSTGRES_PASSWORD=secret\n",
  );
});

test("removeEnvValue drops a key so compose can fall back", () => {
  assert.equal(
    removeEnvValue(
      "OKKEY_IMAGE_TAG=1.0.0\nOKKEY_ENTERPRISE_IMAGE_TAG=2.0.0\nOKKEY_ENTERPRISE_VERSION=2.0.0\n",
      "OKKEY_ENTERPRISE_IMAGE_TAG",
    ),
    "OKKEY_IMAGE_TAG=1.0.0\nOKKEY_ENTERPRISE_VERSION=2.0.0\n",
  );
});

test("core apply over an enterprise install clears the enterprise tag pin", async () => {
  const keys = generateUpdateKeyPair();
  const signed = signOfflinePackage(payload(), keys.privateKeyPem);
  const envDir = mkdtempSync(path.join(tmpdir(), "okkey-update-"));
  const envFile = path.join(envDir, ".env");
  writeFileSync(
    envFile,
    [
      "OKKEY_IMAGE_TAG=1.0.0",
      "OKKEY_ENTERPRISE_IMAGE_TAG=2.0.0",
      "OKKEY_ENTERPRISE_VERSION=2.0.0",
      "OKKEY_API_IMAGE=ghcr.io/example/enterprise-api",
      "OKKEY_WEB_IMAGE=ghcr.io/example/enterprise-web",
      "OKKEY_WORKER_IMAGE=ghcr.io/example/enterprise-worker",
      "",
    ].join("\n"),
  );
  const calls: string[] = [];
  const agent = createUpdateAgent({
    token: "secret",
    publicKeyPem: keys.publicKeyPem,
    isolated: true,
    project: "okkey",
    envFilePath: envFile,
    engine: recordingEngine(calls, { exists: true }),
  });
  const finished = await postJob(agent, signed);
  await agent.settle();
  assert.equal(finished.job.status, "succeeded");
  const env = readFileSync(envFile, "utf8");
  assert.match(env, /OKKEY_IMAGE_TAG=1\.1\.0/);
  assert.match(env, /OKKEY_API_IMAGE=ghcr\.io\/okkeyapp\/api/);
  assert.match(env, /OKKEY_WEB_IMAGE=ghcr\.io\/okkeyapp\/web/);
  assert.match(env, /OKKEY_WORKER_IMAGE=ghcr\.io\/okkeyapp\/worker/);
  assert.equal(env.includes("OKKEY_ENTERPRISE_IMAGE_TAG="), false);
  assert.equal(env.includes("OKKEY_ENTERPRISE_VERSION="), false);
});

test("compose gives the docker socket to the update agent only", () => {
  const yaml = readFileSync(
    new URL("../../../deploy/docker/docker-compose.prod.yml", import.meta.url),
    "utf8",
  );
  const web = serviceBlock(yaml, "web");
  const api = serviceBlock(yaml, "api");
  const worker = serviceBlock(yaml, "worker");
  const agent = serviceBlock(yaml, "update-agent");
  // Volume mounts only — comments may mention the socket without mounting it.
  const sockVolume = /^\s*-\s*\/var\/run\/docker\.sock:\/var\/run\/docker\.sock\s*$/m;
  assert.equal(sockVolume.test(web), false);
  assert.equal(sockVolume.test(api), false);
  assert.equal(sockVolume.test(worker), false);
  assert.equal(sockVolume.test(agent), true);
  assert.match(agent, /update-agent\/main\.ts/);
  for (const block of [api, web, worker, agent]) {
    assert.match(
      block,
      /OKKEY_ENTERPRISE_IMAGE_TAG:-\$\{OKKEY_IMAGE_TAG:-1\.0\.0-beta\.2\}/,
    );
  }
});

test("compose runs update-agent as root with an agent healthcheck (not api :4000)", () => {
  const yaml = readFileSync(
    new URL("../../../deploy/docker/docker-compose.prod.yml", import.meta.url),
    "utf8",
  );
  const api = serviceBlock(yaml, "api");
  const worker = serviceBlock(yaml, "worker");
  const agent = serviceBlock(yaml, "update-agent");
  // Distroless api image defaults to uid 65532; the agent must be root to write
  // host-owned /okkey/.env and open the Docker socket (root:docker 0660).
  assert.match(agent, /^\s*user:\s*"0:0"\s*$/m);
  assert.equal(/^\s*user:/m.test(api), false);
  assert.equal(/^\s*user:/m.test(worker), false);
  assert.match(agent, /OKKEY_INSTALL_DIR:\s*\/okkey/);
  assert.match(agent, /DOCKER_SOCKET:\s*\/var\/run\/docker\.sock/);
  // Inherited api HEALTHCHECK probes :4000; override must probe the agent port.
  assert.match(agent, /127\.0\.0\.1:8090/);
  assert.equal(agent.includes("4000/health"), false);
  assert.match(agent, /r\.status===401/);
});

function assertNoCredentialLeak(blob: string, secret: string): void {
  if (blob.includes(secret) || blob.includes(Buffer.from(secret).toString("base64"))) {
    throw new Error("registry credentials appeared in logs or stored state");
  }
}

function captureLogs(logs: string[]): () => void {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
    stdout: process.stdout.write,
    stderr: process.stderr.write,
  };
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    };
  }
  process.stdout.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error) => void), callback?: (err?: Error) => void) => {
    logs.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return original.stdout.call(process.stdout, chunk, encoding as BufferEncoding, callback);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error) => void), callback?: (err?: Error) => void) => {
    logs.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return original.stderr.call(process.stderr, chunk, encoding as BufferEncoding, callback);
  }) as typeof process.stderr.write;
  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.debug = original.debug;
    process.stdout.write = original.stdout;
    process.stderr.write = original.stderr;
  };
}

function serviceBlock(yaml: string, name: string): string {
  const marker = `\n  ${name}:\n`;
  const start = yaml.indexOf(marker);
  assert.ok(start >= 0, name);
  const rest = yaml.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z0-9-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function recordingEngine(calls: string[], options: { exists?: boolean } = {}) {
  return {
    async pullImage() {
      calls.push("pull");
    },
    async imageExists() {
      calls.push("exists");
      return options.exists ?? false;
    },
    async findServiceContainer(_project: string, service: string) {
      calls.push(`find:${service}`);
      return { id: service, name: service, service, image: "old" };
    },
    async replaceContainer(container: { service: string }) {
      calls.push(`replace:${container.service}`);
      return {
        async rollback() {
          calls.push(`rollback:${container.service}`);
        },
        async commit() {
          calls.push(`commit:${container.service}`);
        },
      };
    },
  };
}

async function postJob(
  agent: ReturnType<typeof createUpdateAgent>,
  document: unknown,
): Promise<{ job: UpdateJob }> {
  const response = new MockResponse();
  await agent.handler(fakeRequest(document), response as unknown as ServerResponse);
  assert.equal(response.statusCode, 202);
  const started = JSON.parse(response.body) as { job: UpdateJob };
  await agent.settle();
  const follow = new MockResponse();
  await agent.handler(
    fakeRequest(undefined, "GET", `/v1/jobs/${started.job.id}`),
    follow as unknown as ServerResponse,
  );
  assert.equal(follow.statusCode, 200);
  return JSON.parse(follow.body) as { job: UpdateJob };
}

function fakeRequest(document: unknown, method = "POST", url = "/v1/jobs"): IncomingMessage {
  const raw = document === undefined ? "" : JSON.stringify(document);
  const chunks = raw ? [Buffer.from(raw)] : [];
  return {
    method,
    url,
    headers: { authorization: "Bearer secret" },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as unknown as IncomingMessage;
}

class MockResponse {
  statusCode = 200;
  body = "";
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
  }
}

async function dispatch(
  app: HttpApp,
  input: { method: string; url: string; headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const response = new MockResponse();
  const request = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    body: input.body,
  };
  await app.handler()(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null,
  };
}
