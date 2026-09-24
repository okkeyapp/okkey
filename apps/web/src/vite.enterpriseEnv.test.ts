import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { enterpriseWebViteEnvDefines, loadEnterpriseWebViteEnv } from "../vite.enterpriseEnv";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadEnterpriseWebViteEnv", () => {
  it("returns empty overlay when enterprise web env dir is missing", () => {
    expect(loadEnterpriseWebViteEnv("development", "/tmp/okkey-enterprise-web-env-missing")).toEqual({});
  });

  it("loads SaaS deployment mode from enterprise web/.env and skips bootstrap flag", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "okkey-ent-web-env-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, ".env"),
      [
        "VITE_ENTERPRISE_MODULES=false",
        "VITE_DEPLOYMENT_MODE=saas",
        "NOT_VITE=ignored",
        "",
      ].join("\n"),
      "utf8",
    );

    const overlay = loadEnterpriseWebViteEnv("development", dir);
    expect(overlay).toEqual({
      VITE_DEPLOYMENT_MODE: "saas",
    });
    expect(overlay.VITE_ENTERPRISE_MODULES).toBeUndefined();
  });

  it("builds import.meta.env defines for overlay keys", () => {
    expect(
      enterpriseWebViteEnvDefines({
        VITE_DEPLOYMENT_MODE: "saas",
      }),
    ).toEqual({
      "import.meta.env.VITE_DEPLOYMENT_MODE": JSON.stringify("saas"),
    });
  });
});
