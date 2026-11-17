import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../src/config.ts";
import {
  buildCoreReleasePackage,
  coreReleasePublishFlags,
  readCoreReleaseSigningKey,
  writeCoreReleaseFiles,
} from "../src/system-updates/build-core-release-package.ts";
import {
  DEFAULT_CORE_UPDATE_FEED_URL,
  resolveCoreUpdateFeedUrl,
} from "../src/system-updates/core-feed.ts";
import { downloadSignedPackage, fetchUpdateFeed } from "../src/system-updates/feed.ts";
import { SystemUpdateError } from "../src/system-updates/errors.ts";
import {
  generateUpdateKeyPair,
  parseUpdateFeed,
  verifyOfflinePackage,
} from "../src/system-updates/package-format.ts";
import { createSystemUpdateService } from "../src/system-updates/service.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const builderPath = fileURLToPath(
  new URL("../src/system-updates/build-core-release-package.ts", import.meta.url),
);
const fixturePath = path.join(repoRoot, "deploy/docker/fixtures/update-feed.v1.json");

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const snapshot = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    snapshot.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    run();
  } finally {
    for (const [key, value] of snapshot.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function configEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    DEPLOY_ENV: "dev",
    OKKEY_SALES_EMAIL: process.env.OKKEY_SALES_EMAIL || "sales@okkey.test",
    OKKEY_UPDATE_CORE_FEED_URL: "",
    OKKEY_UPDATE_FEED_URL: "",
    OKKEY_UPDATE_ISOLATED: "false",
    ...extra,
  };
}

test("core feed URL resolution uses the GitHub Releases default, then env overrides", () => {
  assert.equal(resolveCoreUpdateFeedUrl(undefined, undefined), DEFAULT_CORE_UPDATE_FEED_URL);
  assert.equal(resolveCoreUpdateFeedUrl("", "  "), DEFAULT_CORE_UPDATE_FEED_URL);
  assert.equal(
    resolveCoreUpdateFeedUrl(" https://updates.example/core.json ", ""),
    "https://updates.example/core.json",
  );
  assert.equal(
    resolveCoreUpdateFeedUrl("", "https://legacy.example/feed.json"),
    "https://legacy.example/feed.json",
  );
  assert.equal(
    resolveCoreUpdateFeedUrl("https://core.example/feed.json", "https://legacy.example/feed.json"),
    "https://core.example/feed.json",
  );
  assert.equal(
    DEFAULT_CORE_UPDATE_FEED_URL,
    "https://github.com/okkeyapp/okkey/releases/latest/download/feed.json",
  );
});

test("loadConfig resolves default, override, legacy alias, and isolated mode", () => {
  withEnv(configEnv(), () => {
    const cfg = loadConfig();
    assert.equal(cfg.updateCoreFeedUrl, DEFAULT_CORE_UPDATE_FEED_URL);
    assert.equal(cfg.updateIsolated, false);
  });
  withEnv(configEnv({ OKKEY_UPDATE_CORE_FEED_URL: "https://core.example/feed.json" }), () => {
    assert.equal(loadConfig().updateCoreFeedUrl, "https://core.example/feed.json");
  });
  withEnv(
    configEnv({
      OKKEY_UPDATE_CORE_FEED_URL: "",
      OKKEY_UPDATE_FEED_URL: "https://legacy.example/feed.json",
    }),
    () => {
      assert.equal(loadConfig().updateCoreFeedUrl, "https://legacy.example/feed.json");
    },
  );
  withEnv(configEnv({ OKKEY_UPDATE_ISOLATED: "true" }), () => {
    const cfg = loadConfig();
    assert.equal(cfg.updateIsolated, true);
    assert.equal(cfg.updateCoreFeedUrl, DEFAULT_CORE_UPDATE_FEED_URL);
  });
});

test("a clean install sees a newer version from the feed fixture", async () => {
  let feedUrl = "";
  let isolated = true;
  withEnv(configEnv(), () => {
    const cfg = loadConfig();
    feedUrl = cfg.updateCoreFeedUrl;
    isolated = cfg.updateIsolated;
  });
  assert.equal(feedUrl, DEFAULT_CORE_UPDATE_FEED_URL);
  assert.equal(isolated, false);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { packages: Array<{ version: string }> };
  const seen: string[] = [];
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0-beta.2",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: feedUrl,
    isolated,
    fetchImpl: async (url) => {
      seen.push(url);
      return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
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
  const status = await service.statusFor("owner");
  assert.deepEqual(seen, [DEFAULT_CORE_UPDATE_FEED_URL]);
  assert.equal(status.feedConfigured, true);
  assert.equal(status.isolated, false);
  assert.equal(status.updates.length, 1);
  assert.equal(status.updates[0]?.component, "okkey");
  assert.equal(status.updates[0]?.fromVersion, "1.0.0-beta.2");
  assert.equal(status.updates[0]?.toVersion, fixture.packages[0]?.version);
  assert.equal(status.updates[0]?.toVersion, "1.1.0");
});

test("isolated mode does not fetch the default core feed", async () => {
  let called = false;
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0-beta.2",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    coreFeedUrl: DEFAULT_CORE_UPDATE_FEED_URL,
    isolated: true,
    fetchImpl: async () => {
      called = true;
      throw new Error("should not fetch");
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
  const status = await service.statusFor("owner");
  assert.equal(called, false);
  assert.equal(status.updates.length, 0);
  assert.equal(status.isolated, true);
  await assert.rejects(
    () => service.apply("owner", { source: "feed", component: "okkey" }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "FEED_UNAVAILABLE");
      return true;
    },
  );
  assert.equal(called, false);
});

test("GitHub release redirects are followed and other cross-host redirects are refused", async () => {
  const feed = {
    schema: "okkey.update-feed.v1",
    packages: [
      {
        component: "okkey",
        version: "1.1.0",
        fromVersion: "0.0.0",
        summary: "Core",
        releasedAt: "2026-11-01T00:00:00.000Z",
        packageUrl: "https://github.com/okkeyapp/okkey/releases/download/v1.1.0/okkey-1.1.0.okpkg",
        packageSha256: "ab".repeat(32),
      },
    ],
  };
  const seen: string[] = [];
  const document = await fetchUpdateFeed(DEFAULT_CORE_UPDATE_FEED_URL, false, async (url) => {
    seen.push(url);
    if (url.includes("/releases/latest/")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://github.com/okkeyapp/okkey/releases/download/v1.1.0/feed.json" },
      });
    }
    if (url.includes("/releases/download/")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://release-assets.githubusercontent.com/feed?sig=1" },
      });
    }
    return new Response(JSON.stringify(feed), { status: 200 });
  });
  assert.equal(document?.packages[0]?.version, "1.1.0");
  assert.equal(seen.length, 3);
  assert.equal(seen[2], "https://release-assets.githubusercontent.com/feed?sig=1");

  const blocked: string[] = [];
  await assert.rejects(
    () =>
      fetchUpdateFeed("https://updates.example/feed.json", false, async (url) => {
        blocked.push(url);
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/secret" },
        });
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "FEED_FETCH_FAILED");
      return true;
    },
  );
  assert.deepEqual(blocked, ["https://updates.example/feed.json"]);

  await assert.rejects(
    () =>
      fetchUpdateFeed("https://updates.example/feed.json", false, async () => {
        return new Response(null, {
          status: 302,
          headers: { location: "http://updates.example/feed.json" },
        });
      }),
    (error: unknown) => {
      assert.ok(error instanceof SystemUpdateError);
      assert.equal(error.code, "FEED_FETCH_FAILED");
      return true;
    },
  );
});

test("core release package matches the offline format and is verified with the existing checker", () => {
  const keys = generateUpdateKeyPair();
  const packageUrl =
    "https://github.com/okkeyapp/okkey/releases/download/v1.2.3/okkey-1.2.3.okpkg";
  const built = buildCoreReleasePackage({
    version: "v1.2.3",
    packageUrl,
    privateKeyPem: keys.privateKeyPem.replace(/\n/g, "\\n"),
    releasedAt: "2026-11-14T00:00:00.000Z",
    currentLatestVersion: "v1.2.2",
  });
  assert.equal(built.version, "1.2.3");
  assert.equal(built.fileName, "okkey-1.2.3.okpkg");
  assert.equal(built.flags.prerelease, false);
  assert.equal(built.flags.latest, true);
  const verified = verifyOfflinePackage(JSON.parse(built.packageBytes.toString("utf8")), keys.publicKeyPem);
  assert.equal(verified.payload.component, "okkey");
  assert.equal(verified.payload.version, "1.2.3");
  assert.equal(verified.payload.imageTag, "1.2.3");
  assert.equal(verified.payload.images.api, "ghcr.io/okkeyapp/api:1.2.3");
  assert.equal(verified.payload.images.web, "ghcr.io/okkeyapp/web:1.2.3");
  assert.equal(verified.payload.images.worker, "ghcr.io/okkeyapp/worker:1.2.3");
  const feed = parseUpdateFeed(built.feed);
  assert.equal(feed.packages.length, 1);
  assert.equal(feed.packages[0]?.packageUrl, packageUrl);
  assert.equal(feed.packages[0]?.packageSha256, built.packageSha256);
  assert.equal(feed.packages[0]?.component, "okkey");
  const tampered = JSON.parse(built.packageBytes.toString("utf8")) as { payload: { version: string } };
  tampered.payload.version = "9.9.9";
  assert.throws(() => verifyOfflinePackage(tampered, keys.publicKeyPem), (error: unknown) => {
    assert.ok(error instanceof SystemUpdateError);
    assert.equal(error.code, "SIGNATURE_INVALID");
    return true;
  });
});

test("beta tags are not GitHub pre-releases and latest follows SemVer", () => {
  assert.deepEqual(coreReleasePublishFlags("1.0.0-beta.3", null), { prerelease: false, latest: true });
  assert.deepEqual(coreReleasePublishFlags("1.0.0-beta.3", "v1.0.0-beta.2"), {
    prerelease: false,
    latest: true,
  });
  assert.deepEqual(coreReleasePublishFlags("1.0.0-beta.2", "1.0.0"), {
    prerelease: false,
    latest: false,
  });
  assert.deepEqual(coreReleasePublishFlags("1.0.0", "1.0.0-beta.4"), {
    prerelease: false,
    latest: true,
  });
  assert.deepEqual(coreReleasePublishFlags("1.0.1-beta.1", "1.0.0"), {
    prerelease: false,
    latest: true,
  });
  assert.equal(coreReleasePublishFlags("1.2.3", "1.2.3").latest, true);
  assert.match(buildCoreReleasePackage({
    version: "1.0.0-beta.3",
    packageUrl: "https://github.com/okkeyapp/okkey/releases/download/v1.0.0-beta.3/okkey-1.0.0-beta.3.okpkg",
    privateKeyPem: generateUpdateKeyPair().privateKeyPem,
    releasedAt: "2026-11-14T00:00:00.000Z",
  }).notes, /not marked as a pre-release/);
});

test("the release CLI signs with the env key and does not print it", () => {
  const keys = generateUpdateKeyPair();
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-core-feed-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        builderPath,
        "--version",
        "1.2.3",
        "--package-url",
        "https://github.com/okkeyapp/okkey/releases/download/v1.2.3/okkey-1.2.3.okpkg",
        "--out",
        dir,
        "--released-at",
        "2026-11-14T00:00:00.000Z",
        "--current-latest",
        "1.2.0",
        "--repository",
        "okkeyapp/okkey",
      ],
      {
        env: {
          ...process.env,
          OKKEY_CORE_RELEASE_SIGNING_KEY: keys.privateKeyPem,
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("PRIVATE KEY"), false);
    assert.equal(result.stderr.includes("PRIVATE KEY"), false);
    const feed = parseUpdateFeed(JSON.parse(readFileSync(path.join(dir, "feed.json"), "utf8")));
    const bytes = readFileSync(path.join(dir, "okkey-1.2.3.okpkg"));
    assert.equal(feed.packages[0]?.packageSha256, createHash("sha256").update(bytes).digest("hex"));
    const verified = verifyOfflinePackage(JSON.parse(bytes.toString("utf8")), keys.publicKeyPem);
    assert.equal(verified.payload.version, "1.2.3");
    assert.equal(readFileSync(path.join(dir, "release-flags"), "utf8"), "latest=true\nprerelease=false\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const missing = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      builderPath,
      "--version",
      "1.2.3",
      "--package-url",
      "https://github.com/okkeyapp/okkey/releases/download/v1.2.3/okkey-1.2.3.okpkg",
      "--out",
      dir,
    ],
    {
      env: { ...process.env, OKKEY_CORE_RELEASE_SIGNING_KEY: "" },
      encoding: "utf8",
    },
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /OKKEY_CORE_RELEASE_SIGNING_KEY/);
  assert.throws(() => readCoreReleaseSigningKey({ OKKEY_CORE_RELEASE_SIGNING_KEY: "" }));
});

test("downloaded package bytes must match the feed checksum after a same-host redirect", async () => {
  const keys = generateUpdateKeyPair();
  const packageUrl = "https://updates.example/okkey-1.2.3.okpkg";
  const built = buildCoreReleasePackage({
    version: "1.2.3",
    packageUrl: "https://github.com/okkeyapp/okkey/releases/download/v1.2.3/okkey-1.2.3.okpkg",
    privateKeyPem: keys.privateKeyPem,
    releasedAt: "2026-11-14T00:00:00.000Z",
  });
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-core-feed-files-"));
  try {
    writeCoreReleaseFiles(dir, built);
    assert.equal(readFileSync(path.join(dir, "feed.json"), "utf8").includes(built.packageSha256), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const downloaded = await downloadSignedPackage(packageUrl, built.packageSha256, async (url) => {
    if (url === packageUrl) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://updates.example/objects/okkey-1.2.3.okpkg" },
      });
    }
    return new Response(built.packageBytes, { status: 200 });
  });
  assert.equal(downloaded.payload.version, "1.2.3");
});
