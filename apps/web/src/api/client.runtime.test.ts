import { describe, expect, it, afterEach } from "vitest";
import { getApiBaseUrl, resolveApiBaseUrl } from "./client";

describe("resolveApiBaseUrl", () => {
  it("accepts absolute http origins", () => {
    expect(resolveApiBaseUrl("https://api.example.com/")).toBe("https://api.example.com");
  });
});

describe("getApiBaseUrl runtime override", () => {
  afterEach(() => {
    delete window.__OKKEY_RUNTIME__;
  });

  it("prefers window.__OKKEY_RUNTIME__.apiBaseUrl over Vite env", () => {
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: "https://runtime.example.com" };
    expect(getApiBaseUrl()).toBe("https://runtime.example.com");
  });
});
