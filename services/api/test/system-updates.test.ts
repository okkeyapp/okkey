import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { HttpApp } from "../src/http.ts";
import { feedRequestUrl, fetchUpdateFeed } from "../src/system-updates/feed.ts";
import {
  generateUpdateKeyPair,
  signOfflinePackage,
  verifyOfflinePackage,
  type OfflinePackagePayload,
} from "../src/system-updates/package-format.ts";
import {
  createSystemUpdateService,
  visibleUpdates,
  type UpdateAgentClient,
  type UpdateJob,
} from "../src/system-updates/service.ts";
import { compareVersions, shouldShowUpdate } from "../src/system-updates/versions.ts";
import { applyVerifiedCorePackage, setEnvValue, type UpdateApplyEngine } from "../src/update-agent/apply.ts";
import { createDockerApplyEngine, type DockerTransport } from "../src/update-agent/docker-engine.ts";
import { createUpdateAgent } from "../src/update-agent/server.ts";
import { SystemUpdateError } from "../src/system-updates/errors.ts";
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
    feedUrl: "http://updates.internal/feed.json",
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
    feedUrl: "http://updates.internal/feed.json",
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

test("dismiss hides the current version and returns for a newer one", async () => {
  const service = createSystemUpdateService({
    deploymentMode: "self_hosted",
    currentVersion: "1.0.0",
    enterpriseInstalled: false,
    enterpriseVersion: "",
    feedUrl: "",
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
    feedUrl: "http://updates.internal/feed.json",
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
    feedUrl: "http://updates.internal/feed.json",
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
    feedUrl: "",
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

test("update agent verifies a signature before apply and leaves enterprise packages unapplied", async () => {
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
  assert.equal(calls.includes("pull"), false);
  assert.equal(calls.filter((call) => call.startsWith("replace")).length, 3);
  assert.match(readFileSync(envFile, "utf8"), /OKKEY_IMAGE_TAG=1\.1\.0/);

  calls.length = 0;
  writeFileSync(envFile, "OKKEY_IMAGE_TAG=1.0.0-beta.2\n");
  const enterprise = signOfflinePackage(
    payload({
      component: "enterprise",
      version: "2.0.0",
      images: { enterprise: "example.invalid/enterprise:2.0.0" },
    }),
    keys.privateKeyPem,
  );
  const skipped = await postJob(agent, enterprise);
  await agent.settle();
  assert.equal(skipped.job.errorCode, "ENTERPRISE_APPLY_UNAVAILABLE");
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
    if (requestPath.startsWith("/v1.43/images/create")) {
      return { status: 200, body: "" };
    }
    if (requestPath.includes("/containers/create")) {
      assert.match(body ?? "", /ghcr.io\/okkeyapp\/api:1.1.0/);
      return { status: 500, body: "no" };
    }
    if (requestPath.includes("/json")) {
      return {
        status: 200,
        body: JSON.stringify({
          Id: "old",
          Name: "/okkey-api-1",
          Config: { Env: ["OKKEY_VERSION=1.0.0"], Labels: {} },
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

test("setEnvValue replaces the image tag without dropping other keys", () => {
  assert.equal(
    setEnvValue("OKKEY_IMAGE_TAG=1.0.0\nPOSTGRES_PASSWORD=secret\n", "OKKEY_IMAGE_TAG", "1.1.0"),
    "OKKEY_IMAGE_TAG=1.1.0\nPOSTGRES_PASSWORD=secret\n",
  );
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
  assert.equal(web.includes("docker.sock"), false);
  assert.equal(api.includes("docker.sock"), false);
  assert.equal(worker.includes("docker.sock"), false);
  assert.equal(agent.includes("/var/run/docker.sock"), true);
  assert.match(agent, /update-agent\/main\.ts/);
});

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
