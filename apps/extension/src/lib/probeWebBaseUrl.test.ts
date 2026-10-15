import test from "node:test";
import assert from "node:assert/strict";

import {
  WEB_BASE_URL_UNREACHABLE_ERROR,
  probeWebBaseUrl,
} from "./probeWebBaseUrl.ts";

test("probeWebBaseUrl resolves when fetch returns any HTTP response", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(null, { status: 404, statusText: "Not Found" });
  await assert.doesNotReject(() =>
    probeWebBaseUrl("http://localhost:8099", { fetchImpl, timeoutMs: 500 }),
  );
});

test("probeWebBaseUrl throws when fetch rejects (connection refused)", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    () => probeWebBaseUrl("http://localhost:8099", { fetchImpl, timeoutMs: 500 }),
    (err: unknown) =>
      err instanceof Error && err.message === WEB_BASE_URL_UNREACHABLE_ERROR,
  );
});

test("probeWebBaseUrl throws when the request is aborted (timeout)", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const signal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      if (!signal) {
        reject(new Error("missing signal"));
        return;
      }
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  };
  await assert.rejects(
    () => probeWebBaseUrl("http://localhost:8099", { fetchImpl, timeoutMs: 20 }),
    (err: unknown) =>
      err instanceof Error && err.message === WEB_BASE_URL_UNREACHABLE_ERROR,
  );
});
