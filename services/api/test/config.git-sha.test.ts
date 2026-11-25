import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadConfig } from "../src/config.ts";
import { HttpApp } from "../src/http.ts";
import { registerSystemUpdateRoutes } from "../src/system-updates/routes.ts";
import { createSystemUpdateService } from "../src/system-updates/service.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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
    OKKEY_GIT_SHA: undefined,
    OKKEY_ENTERPRISE_GIT_SHA: undefined,
    ENTERPRISE_MODULES: undefined,
    ENTERPRISE_MODULES_PATH: undefined,
    ...extra,
  };
}

function withLoadableEnterpriseTree(run: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-ee-sha-"));
  mkdirSync(path.join(dir, "backend/api-plugin"), { recursive: true });
  writeFileSync(path.join(dir, "backend/api-plugin/index.ts"), "export {};\n");
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  input: { method: string; url: string; headers?: Record<string, string> },
): Promise<{ status: number; body: unknown }> {
  const response = new MockResponse();
  const request = {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
  };
  await app.handler()(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null,
  };
}

test("loadConfig reads OKKEY_GIT_SHA and OKKEY_ENTERPRISE_GIT_SHA when enterprise modules are enabled", () => {
  const coreSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const enterpriseSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  withLoadableEnterpriseTree((enterpriseDir) => {
    withEnv(
      configEnv({
        NODE_ENV: "production",
        ENTERPRISE_MODULES: "true",
        ENTERPRISE_MODULES_PATH: enterpriseDir,
        OKKEY_GIT_SHA: ` ${coreSha} `,
        OKKEY_ENTERPRISE_GIT_SHA: ` ${enterpriseSha} `,
      }),
      () => {
        const cfg = loadConfig();
        assert.equal(cfg.enterpriseModulesEnabled, true);
        assert.equal(cfg.gitSha, coreSha);
        assert.equal(cfg.enterpriseGitSha, enterpriseSha);
      },
    );
  });
});

test("loadConfig keeps empty git SHA outside development when env is unset", () => {
  withEnv(
    configEnv({
      NODE_ENV: "production",
      OKKEY_GIT_SHA: undefined,
      OKKEY_ENTERPRISE_GIT_SHA: "",
    }),
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.gitSha, "");
      assert.equal(cfg.enterpriseGitSha, "");
    },
  );
});

test("loadConfig ignores sibling checkout SHA when enterprise modules are disabled", () => {
  // Point at this repository: it is a git checkout, so a naive git fallback would
  // return a SHA, but modules stay off because the tree is not a loadable edition.
  withEnv(
    configEnv({
      NODE_ENV: "development",
      ENTERPRISE_MODULES: "false",
      ENTERPRISE_MODULES_PATH: repoRoot,
      OKKEY_ENTERPRISE_GIT_SHA: undefined,
      OKKEY_GIT_SHA: "cccccccccccccccccccccccccccccccccccccccc",
    }),
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.enterpriseModulesEnabled, false);
      assert.equal(cfg.enterpriseGitSha, "");
      assert.equal(cfg.gitSha, "cccccccccccccccccccccccccccccccccccccccc");
    },
  );
});

test("loadConfig ignores OKKEY_ENTERPRISE_GIT_SHA when enterprise modules are disabled", () => {
  withEnv(
    configEnv({
      NODE_ENV: "production",
      ENTERPRISE_MODULES: "false",
      OKKEY_ENTERPRISE_GIT_SHA: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }),
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.enterpriseModulesEnabled, false);
      assert.equal(cfg.enterpriseGitSha, "");
    },
  );
});

test("OKKEY_GIT_SHA from env reaches GET /system/updates as commitSha", async () => {
  const coreSha = "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560";
  const enterpriseSha = "abcdef0123456789abcdef0123456789abcdef01";

  let cfg!: ReturnType<typeof loadConfig>;
  withLoadableEnterpriseTree((enterpriseDir) => {
    withEnv(
      configEnv({
        NODE_ENV: "production",
        ENTERPRISE_MODULES: "true",
        ENTERPRISE_MODULES_PATH: enterpriseDir,
        OKKEY_VERSION: "1.0.0-beta.3",
        OKKEY_GIT_SHA: coreSha,
        OKKEY_ENTERPRISE_GIT_SHA: enterpriseSha,
        OKKEY_UPDATE_ISOLATED: "true",
      }),
      () => {
        cfg = loadConfig();
      },
    );
  });

  const service = createSystemUpdateService({
    deploymentMode: cfg.deploymentMode,
    currentVersion: cfg.systemVersion,
    commitSha: cfg.gitSha,
    releaseTag: cfg.releaseTag,
    enterpriseInstalled: true,
    enterpriseVersion: cfg.enterpriseVersion || "1.0.0",
    enterpriseCommitSha: cfg.enterpriseGitSha,
    coreFeedUrl: cfg.updateCoreFeedUrl,
    enterpriseFeedUrl: cfg.updateEnterpriseFeedUrl,
    isolated: cfg.updateIsolated,
    agent: {
      async start() {
        throw new Error("no apply");
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => false,
  });

  const app = new HttpApp();
  registerSystemUpdateRoutes(
    (method, path, handler) => app.route(method, path, handler),
    cfg,
    service,
    async () => "owner",
  );

  const response = await dispatch(app, {
    method: "GET",
    url: "/system/updates",
  });
  assert.equal(response.status, 200);
  const body = response.body as {
    commitSha: string | null;
    enterpriseCommitSha: string | null;
    currentVersion: string;
    enterpriseInstalled: boolean;
  };
  assert.equal(body.commitSha, coreSha);
  assert.equal(body.enterpriseCommitSha, enterpriseSha);
  assert.equal(body.currentVersion, "1.0.0-beta.3");
  assert.equal(body.enterpriseInstalled, true);
});

test("GET /system/updates omits enterpriseCommitSha when OKKEY_ENTERPRISE_GIT_SHA is unset", async () => {
  const coreSha = "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560";

  let cfg!: ReturnType<typeof loadConfig>;
  withEnv(
    configEnv({
      NODE_ENV: "production",
      OKKEY_VERSION: "0.0.0-dev",
      OKKEY_GIT_SHA: coreSha,
      OKKEY_ENTERPRISE_GIT_SHA: undefined,
      OKKEY_UPDATE_ISOLATED: "true",
    }),
    () => {
      cfg = loadConfig();
    },
  );

  const service = createSystemUpdateService({
    deploymentMode: cfg.deploymentMode,
    currentVersion: cfg.systemVersion,
    commitSha: cfg.gitSha,
    releaseTag: cfg.releaseTag,
    enterpriseInstalled: true,
    enterpriseVersion: "1.0.0",
    enterpriseCommitSha: cfg.enterpriseGitSha,
    coreFeedUrl: cfg.updateCoreFeedUrl,
    enterpriseFeedUrl: cfg.updateEnterpriseFeedUrl,
    isolated: cfg.updateIsolated,
    agent: {
      async start() {
        throw new Error("no apply");
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => false,
  });

  const app = new HttpApp();
  registerSystemUpdateRoutes(
    (method, path, handler) => app.route(method, path, handler),
    cfg,
    service,
    async () => "owner",
  );

  const response = await dispatch(app, {
    method: "GET",
    url: "/system/updates",
  });
  assert.equal(response.status, 200);
  const body = response.body as {
    commitSha: string | null;
    enterpriseCommitSha: string | null;
  };
  assert.equal(body.commitSha, coreSha);
  assert.equal(body.enterpriseCommitSha, null);
});

test("GET /system/updates omits enterpriseCommitSha when enterprise is not installed", async () => {
  const coreSha = "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560";
  const leftoverEnterpriseSha = "abcdef0123456789abcdef0123456789abcdef01";

  let cfg!: ReturnType<typeof loadConfig>;
  withEnv(
    configEnv({
      NODE_ENV: "production",
      OKKEY_VERSION: "0.0.0-dev",
      OKKEY_GIT_SHA: coreSha,
      OKKEY_UPDATE_ISOLATED: "true",
    }),
    () => {
      cfg = loadConfig();
    },
  );

  const service = createSystemUpdateService({
    deploymentMode: cfg.deploymentMode,
    currentVersion: cfg.systemVersion,
    commitSha: cfg.gitSha,
    releaseTag: cfg.releaseTag,
    enterpriseInstalled: false,
    enterpriseVersion: "",
    // Leftover SHA must not appear when the edition is off.
    enterpriseCommitSha: leftoverEnterpriseSha,
    coreFeedUrl: cfg.updateCoreFeedUrl,
    enterpriseFeedUrl: cfg.updateEnterpriseFeedUrl,
    isolated: cfg.updateIsolated,
    agent: {
      async start() {
        throw new Error("no apply");
      },
      async get() {
        return null;
      },
    },
    isAdmin: async () => false,
  });

  const app = new HttpApp();
  registerSystemUpdateRoutes(
    (method, path, handler) => app.route(method, path, handler),
    cfg,
    service,
    async () => "owner",
  );

  const response = await dispatch(app, {
    method: "GET",
    url: "/system/updates",
  });
  assert.equal(response.status, 200);
  const body = response.body as {
    commitSha: string | null;
    enterpriseCommitSha: string | null;
    enterpriseInstalled: boolean;
  };
  assert.equal(body.commitSha, coreSha);
  assert.equal(body.enterpriseInstalled, false);
  assert.equal(body.enterpriseCommitSha, null);
});
