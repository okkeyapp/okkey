import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isOkkeyWebAppOrigin,
  originFromWebBaseUrl,
  setConfiguredOkkeyWebBaseUrls,
} from "./okkeyWebAppOrigin.ts";

describe("isOkkeyWebAppOrigin", () => {
  it("matches saas and localhost vite defaults", () => {
    assert.equal(
      isOkkeyWebAppOrigin({ hostname: "okkey.app", port: "", protocol: "https:", origin: "https://okkey.app" }),
      true,
    );
    assert.equal(
      isOkkeyWebAppOrigin({
        hostname: "app.okkey.app",
        port: "",
        protocol: "https:",
        origin: "https://app.okkey.app",
      }),
      true,
    );
    assert.equal(
      isOkkeyWebAppOrigin({
        hostname: "localhost",
        port: "5173",
        protocol: "http:",
        origin: "http://localhost:5173",
      }),
      true,
    );
    assert.equal(
      isOkkeyWebAppOrigin({
        hostname: "[::1]",
        port: "5173",
        protocol: "http:",
        origin: "http://[::1]:5173",
      }),
      true,
    );
    assert.equal(
      isOkkeyWebAppOrigin({
        hostname: "example.com",
        port: "",
        protocol: "https:",
        origin: "https://example.com",
      }),
      false,
    );
    assert.equal(
      isOkkeyWebAppOrigin({
        hostname: "localhost",
        port: "8080",
        protocol: "http:",
        origin: "http://localhost:8080",
      }),
      false,
    );
  });

  it("matches extension-configured webBaseUrl (self-host Docker :8080)", () => {
    const dockerWeb = {
      hostname: "localhost",
      port: "8080",
      protocol: "http:",
      origin: "http://localhost:8080",
    } as const;

    assert.equal(isOkkeyWebAppOrigin(dockerWeb), false);
    assert.equal(
      isOkkeyWebAppOrigin(dockerWeb, { configuredWebBaseUrls: ["http://localhost:8080"] }),
      true,
    );
    assert.equal(
      isOkkeyWebAppOrigin(dockerWeb, { configuredWebBaseUrls: ["http://localhost:8080/"] }),
      true,
    );
    // API port must not be treated as the vault web app.
    assert.equal(
      isOkkeyWebAppOrigin(
        { hostname: "localhost", port: "4000", protocol: "http:", origin: "http://localhost:4000" },
        { configuredWebBaseUrls: ["http://localhost:8080"] },
      ),
      false,
    );
    assert.equal(
      isOkkeyWebAppOrigin(
        { hostname: "example.com", port: "", protocol: "https:", origin: "https://example.com" },
        { configuredWebBaseUrls: ["http://localhost:8080"] },
      ),
      false,
    );
  });

  it("honors setConfiguredOkkeyWebBaseUrls cache for sync call sites", () => {
    setConfiguredOkkeyWebBaseUrls([]);
    assert.equal(
      isOkkeyWebAppOrigin({
        hostname: "127.0.0.1",
        port: "8080",
        protocol: "http:",
        origin: "http://127.0.0.1:8080",
      }),
      false,
    );

    setConfiguredOkkeyWebBaseUrls(["http://127.0.0.1:8080"]);
    assert.equal(
      isOkkeyWebAppOrigin({
        hostname: "127.0.0.1",
        port: "8080",
        protocol: "http:",
        origin: "http://127.0.0.1:8080",
      }),
      true,
    );

    setConfiguredOkkeyWebBaseUrls([]);
  });

  it("originFromWebBaseUrl normalizes trailing slash and missing scheme", () => {
    assert.equal(originFromWebBaseUrl("http://localhost:8080/"), "http://localhost:8080");
    assert.equal(originFromWebBaseUrl("localhost:8080"), "https://localhost:8080");
    assert.equal(originFromWebBaseUrl(""), null);
    assert.equal(originFromWebBaseUrl("not a url"), null);
  });
});
