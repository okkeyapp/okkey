import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { extensionManifestPermissions } from "./extensionManifestPermissions.ts";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function documentedPermissions(markdown: string): Set<string> {
  const section = markdown.split("## Manifest permissions")[1]?.split("\n## ")[0] ?? "";
  const names = new Set<string>();
  for (const match of section.matchAll(/`([^`]+)`/g)) {
    const token = match[1]?.trim();
    if (token) {
      names.add(token);
    }
  }
  return names;
}

describe("extension manifest permissions", () => {
  it("lists only permissions documented in PERMISSIONS.md", () => {
    const markdown = fs.readFileSync(path.join(extensionRoot, "store/PERMISSIONS.md"), "utf8");
    const documented = documentedPermissions(markdown);
    for (const browser of ["chrome", "firefox"]) {
      for (const permission of extensionManifestPermissions(browser)) {
        assert.ok(documented.has(permission), `${browser} permission ${permission} is missing from PERMISSIONS.md`);
      }
    }
    const chromium = extensionManifestPermissions("chrome");
    const firefox = extensionManifestPermissions("firefox");
    assert.equal(chromium.includes("webRequestBlocking"), false);
    assert.equal(chromium.includes("webRequest"), true);
    assert.equal(chromium.includes("webRequestAuthProvider"), true);
    assert.equal(firefox.includes("webRequestAuthProvider"), false);
    assert.equal(firefox.includes("offscreen"), false);
    assert.equal(firefox.includes("webRequest"), true);
    assert.equal(firefox.includes("webRequestBlocking"), true);
    assert.match(markdown, /does not read all requests/i);
    assert.match(markdown, /does not answer without confirmation/i);
  });

  it("keeps the browser split in wxt.config.ts", () => {
    const config = fs.readFileSync(path.join(extensionRoot, "wxt.config.ts"), "utf8");
    assert.match(config, /const permissions = extensionManifestPermissions\(browser\)/);
  });

  it("checks built manifests when they exist", () => {
    const markdown = fs.readFileSync(path.join(extensionRoot, "store/PERMISSIONS.md"), "utf8");
    const documented = documentedPermissions(markdown);
    const builds: Array<[string, string]> = [
      ["chrome", "chrome-mv3"],
      ["firefox", "firefox-mv3"],
    ];
    for (const [browser, folder] of builds) {
      const manifestPath = path.join(extensionRoot, "output", folder, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        continue;
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { permissions?: string[] };
      const permissions = manifest.permissions ?? [];
      assert.deepEqual([...permissions].sort(), [...extensionManifestPermissions(browser)].sort());
      for (const permission of permissions) {
        assert.ok(documented.has(permission), `${folder} manifest permission ${permission} is not in PERMISSIONS.md`);
      }
    }
  });
});
