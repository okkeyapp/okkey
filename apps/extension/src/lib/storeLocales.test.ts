import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertStoreLocalesPackageAligned,
  listPackageStoreLocaleDirs,
  readExtensionStoreLocalesConfig,
} from "./storeLocales.ts";

const extensionRoot = fileURLToPath(new URL("../..", import.meta.url));

test("store locales config lists package + listing locales without hardcoding", () => {
  const { config, packageLocales, listingLocales } = assertStoreLocalesPackageAligned(extensionRoot);
  assert.equal(config.defaultLocale, "en");
  assert.deepEqual([...config.locales].sort(), [...packageLocales].sort());
  assert.deepEqual([...config.locales].sort(), [...listingLocales].sort());
  assert.ok(config.locales.includes("en"));
  assert.ok(config.locales.includes("ru"));
});

test("adding a package locale directory is discovered without code changes", () => {
  const root = mkdtempSync(join(tmpdir(), "okkey-store-locales-"));
  mkdirSync(join(root, "store"), { recursive: true });
  writeFileSync(
    join(root, "store", "locales.json"),
    JSON.stringify({ defaultLocale: "en", locales: ["en", "xx"] }),
  );
  writeFileSync(join(root, "store", "LISTING.en.md"), "# en\n");
  writeFileSync(join(root, "store", "LISTING.xx.md"), "# xx\n");
  for (const code of ["en", "xx"]) {
    mkdirSync(join(root, "public", "_locales", code), { recursive: true });
    writeFileSync(
      join(root, "public", "_locales", code, "messages.json"),
      JSON.stringify({ actionTitle: { message: code } }),
    );
  }
  assert.deepEqual(listPackageStoreLocaleDirs(root), ["en", "xx"]);
  assert.deepEqual(readExtensionStoreLocalesConfig(root).locales, ["en", "xx"]);
  assert.doesNotThrow(() => assertStoreLocalesPackageAligned(root));
});
