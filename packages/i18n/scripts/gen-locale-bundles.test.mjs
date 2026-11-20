import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./gen-locale-bundles.mjs", import.meta.url));
const pkgRoot = path.dirname(path.dirname(scriptPath));

function writeMinimalLocaleTree(root, { includeXx = false } = {}) {
  const webDir = path.join(root, "src", "locales", "web");
  const emailDir = path.join(root, "src", "locales", "email");
  fs.mkdirSync(webDir, { recursive: true });
  fs.mkdirSync(emailDir, { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(scriptPath, path.join(root, "scripts", "gen-locale-bundles.mjs"));

  const enWeb = {
    "web.locale.nativeName": "English",
    "web.hello": "Hello",
    "web.onlyEn": "EN-only",
  };
  const ruWeb = {
    "web.locale.nativeName": "Русский",
    "web.hello": "Привет",
  };
  const enEmail = { "email.hello": "Hello", "email.onlyEn": "EN-only" };
  const ruEmail = { "email.hello": "Привет" };

  fs.writeFileSync(path.join(webDir, "en.json"), JSON.stringify(enWeb));
  fs.writeFileSync(path.join(webDir, "ru.json"), JSON.stringify(ruWeb));
  fs.writeFileSync(path.join(emailDir, "en.json"), JSON.stringify(enEmail));
  fs.writeFileSync(path.join(emailDir, "ru.json"), JSON.stringify(ruEmail));

  if (includeXx) {
    // Partial locale (<80%) — discovered but not ready.
    fs.writeFileSync(
      path.join(webDir, "xx.json"),
      JSON.stringify({ "web.locale.nativeName": "XX", "web.hello": "X" }),
    );
    fs.writeFileSync(path.join(emailDir, "xx.json"), JSON.stringify({ "email.hello": "X" }));
  }

  fs.writeFileSync(
    path.join(root, "src", "locales", "manifest.json"),
    JSON.stringify({
      readinessThresholdPercent: 80,
      defaults: {
        fallback: "en",
        web: "en",
        email: "en",
        extensionUi: "ru",
        storePackage: "en",
      },
      locales: {
        en: {
          intl: "en-US",
          dir: "ltr",
          dateFns: "enUS",
          docsPathPrefix: "/en",
          yearMonthOrder: "month-year",
          ready: true,
        },
        ru: {
          intl: "ru-RU",
          dir: "ltr",
          dateFns: "ru",
          docsPathPrefix: "",
          yearMonthOrder: "year-month",
          ready: true,
        },
        ...(includeXx
          ? {
              xx: {
                intl: "en-US",
                dir: "ltr",
                dateFns: "enUS",
                docsPathPrefix: "/en",
                yearMonthOrder: "month-year",
                ready: true,
              },
            }
          : {}),
      },
    }),
  );
}

test("gen discovers a dropped-in locale without code changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "okkey-i18n-gen-"));
  writeMinimalLocaleTree(root, { includeXx: true });
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "gen-locale-bundles.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const registry = fs.readFileSync(path.join(root, "src", "locale-registry.gen.ts"), "utf8");
  assert.match(registry, /APP_LOCALES = \["en","ru","xx"\]/);
  assert.match(registry, /READY_LOCALES = \["en"\]/); // ru + xx below threshold in this fixture
  assert.match(fs.readFileSync(path.join(root, "src", "email-bundles.gen.ts"), "utf8"), /\bxx\b/);
  assert.match(fs.readFileSync(path.join(root, "src", "web-bundles.gen.ts"), "utf8"), /\bxx\b/);
});

test("production generator keeps en+ru ready and coverage gate at 80", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: pkgRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const registry = fs.readFileSync(path.join(pkgRoot, "src", "locale-registry.gen.ts"), "utf8");
  assert.match(registry, /LOCALE_READINESS_THRESHOLD_PERCENT = 80/);
  assert.match(registry, /READY_LOCALES = \[[^\]]*\"en\"[^\]]*\]/);
  assert.match(registry, /READY_LOCALES = \[[^\]]*\"ru\"[^\]]*\]/);
});
