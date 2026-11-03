import test from "node:test";
import assert from "node:assert/strict";

import { parseBrowserEnvironment } from "./browserEnvironment.ts";

test("parseBrowserEnvironment with Extension channel uses extension- fingerprint and short name", () => {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const env = parseBrowserEnvironment(ua, { channel: "Extension" });
  assert.equal(env.channel, "Extension");
  assert.ok(env.fingerprint.startsWith("extension-"));
  assert.equal(env.deviceName, "Extension Chrome");
  assert.equal(env.platformOsLabel, "Extension · Chrome · macOS");
});
