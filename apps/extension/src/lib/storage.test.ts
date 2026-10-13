import test from "node:test";
import assert from "node:assert/strict";

import {
  isLoopbackHostname,
  normalizeWebBaseUrl,
  resolveApiBaseFromWebBase,
} from "./storage.ts";

test("normalizeWebBaseUrl adds https and strips path", () => {
  assert.equal(normalizeWebBaseUrl("okkey.app"), "https://okkey.app");
  assert.equal(normalizeWebBaseUrl("http://localhost:5173/foo"), "http://localhost:5173");
});

test("resolveApiBaseFromWebBase maps loopback web to :4000 only", () => {
  assert.equal(resolveApiBaseFromWebBase("http://localhost:5173"), "http://localhost:4000");
  assert.equal(resolveApiBaseFromWebBase("http://127.0.0.1:5173"), "http://127.0.0.1:4000");
  assert.equal(resolveApiBaseFromWebBase("http://[::1]:5173"), "http://[::1]:4000");
});

test("resolveApiBaseFromWebBase keeps custom domain / LAN origin (no :4000)", () => {
  assert.equal(resolveApiBaseFromWebBase("https://okkey.app"), "https://okkey.app");
  assert.equal(resolveApiBaseFromWebBase("https://vault.example.com"), "https://vault.example.com");
  assert.equal(resolveApiBaseFromWebBase("https://vault.example.com:8443"), "https://vault.example.com:8443");
  assert.equal(resolveApiBaseFromWebBase("http://192.168.1.10:8080"), "http://192.168.1.10:8080");
  assert.equal(resolveApiBaseFromWebBase("https://okkey.local"), "https://okkey.local");
});

test("isLoopbackHostname", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("vault.example.com"), false);
  assert.equal(isLoopbackHostname("localhost.example.com"), false);
});
