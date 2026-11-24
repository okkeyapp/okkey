import assert from "node:assert/strict";
import test from "node:test";

import { resetCapsuleAccessSettingsProviderForTests } from "../src/capsule/access-settings-provider.ts";
import { createApiApp, type CreateApiAppOptions } from "../src/app.ts";
import type { Logger } from "../src/logger.ts";
import type { ApiEnterprisePlugin } from "../src/plugins/types.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const logger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function pluginHostOptions(): CreateApiAppOptions {
  return {
    postgres: {} as NonNullable<CreateApiAppOptions["postgres"]>,
    workspacesRepository: {} as NonNullable<CreateApiAppOptions["workspacesRepository"]>,
  };
}

function delayedPlugin(id: string, events: string[], delayMs: number): ApiEnterprisePlugin {
  return {
    id,
    async register() {
      events.push(`${id}:start`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      events.push(`${id}:end`);
    },
  };
}

test("enterprise plugins register sequentially and a rejecting register fails app build", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  const events: string[] = [];
  const app = createApiApp(createTestApiConfig(), logger, {}, {
    ...pluginHostOptions(),
    enterprisePlugins: [delayedPlugin("A", events, 30), delayedPlugin("B", events, 30)],
  });

  await app.pluginsReady;

  assert.deepEqual(events, ["A:start", "A:end", "B:start", "B:end"]);
  assert.ok(events.indexOf("A:end") < events.indexOf("B:start"));

  const seen: string[] = [];
  const failing = createApiApp(createTestApiConfig(), logger, {}, {
    ...pluginHostOptions(),
    enterprisePlugins: [
      {
        id: "bad",
        async register() {
          seen.push("bad:start");
          throw new Error("plugin register failed");
        },
      },
      {
        id: "next",
        async register() {
          seen.push("next:start");
        },
      },
    ],
  });

  await assert.rejects(failing.pluginsReady, /plugin register failed/);
  assert.deepEqual(seen, ["bad:start"]);
});
