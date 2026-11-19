import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiBaseUrl, resolveApiBaseUrl } from "./client";

describe("resolveApiBaseUrl", () => {
  it("accepts absolute http origins", () => {
    expect(resolveApiBaseUrl("https://api.example.com/")).toBe("https://api.example.com");
  });
});

describe("getApiBaseUrl runtime override", () => {
  afterEach(() => {
    delete window.__OKKEY_RUNTIME__;
    vi.unstubAllEnvs();
  });

  it("prefers window.__OKKEY_RUNTIME__.apiBaseUrl over Vite env", () => {
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: "https://runtime.example.com" };
    expect(getApiBaseUrl()).toBe("https://runtime.example.com");
  });

  it("treats explicit empty runtime apiBaseUrl as same-origin (does not fall through to Vite)", () => {
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: "" };
    // Even if Vite env were localhost, runtime empty must win as same-origin.
    expect(getApiBaseUrl()).toBe("");
  });
});
