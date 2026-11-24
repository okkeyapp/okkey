import test from "node:test";
import assert from "node:assert/strict";

import { SystemUpdateError } from "../src/system-updates/errors.ts";
import {
  createDockerApplyEngine,
  HIGHEST_SUPPORTED_DOCKER_API_VERSION,
  isDockerClientVersionTooOld,
  negotiateDockerApiVersion,
  pickDockerApiVersion,
  type DockerTransport,
  type DockerTransportResult,
} from "../src/update-agent/docker-engine.ts";

test("pickDockerApiVersion uses the daemon version when below our maximum", () => {
  assert.equal(
    pickDockerApiVersion({ apiVersion: "1.43", minApiVersion: "1.24" }),
    "1.43",
  );
});

test("pickDockerApiVersion caps at the highest version we support", () => {
  assert.equal(
    pickDockerApiVersion({
      apiVersion: "1.99",
      minApiVersion: "1.40",
      highestSupported: "1.52",
    }),
    "1.52",
  );
});

test("pickDockerApiVersion supports Docker Engine 29.0–29.2 minimum 1.44", () => {
  assert.equal(
    pickDockerApiVersion({
      apiVersion: "1.52",
      minApiVersion: "1.44",
      highestSupported: HIGHEST_SUPPORTED_DOCKER_API_VERSION,
    }),
    HIGHEST_SUPPORTED_DOCKER_API_VERSION,
  );
});

test("pickDockerApiVersion fails when nothing we support meets the daemon minimum", () => {
  assert.throws(
    () =>
      pickDockerApiVersion({
        apiVersion: "1.52",
        minApiVersion: "1.60",
        highestSupported: "1.52",
      }),
    (error: unknown) =>
      error instanceof SystemUpdateError &&
      /No compatible Docker Engine API version/.test(error.message),
  );
});

test("pickDockerApiVersion fails when the daemon omits API-Version", () => {
  assert.throws(
    () => pickDockerApiVersion({ apiVersion: null, minApiVersion: "1.40" }),
    (error: unknown) =>
      error instanceof SystemUpdateError && /did not report a usable API version/.test(error.message),
  );
});

test("isDockerClientVersionTooOld detects the Engine 29 rejection", () => {
  assert.equal(
    isDockerClientVersionTooOld(400, "client version 1.43 is too old. Minimum supported API version is 1.44"),
    true,
  );
  assert.equal(isDockerClientVersionTooOld(400, "something else"), false);
  assert.equal(isDockerClientVersionTooOld(500, "client version 1.43 is too old"), false);
});

test("negotiateDockerApiVersion reads /_ping headers for an older daemon", async () => {
  const transport = pingTransport({
    "Api-Version": "1.43",
    MinAPIVersion: "1.24",
  });
  assert.equal(await negotiateDockerApiVersion(transport), "1.43");
});

test("negotiateDockerApiVersion reads /_ping headers for Docker Engine 29.0–29.2", async () => {
  const transport = pingTransport({
    "API-Version": "1.52",
    MinAPIVersion: "1.44",
  });
  assert.equal(await negotiateDockerApiVersion(transport), "1.52");
});

test("negotiateDockerApiVersion falls back to /version when ping headers are missing", async () => {
  const transport: DockerTransport = async (_method, path) => {
    if (path === "/_ping") {
      return { status: 200, body: "OK", headers: {} };
    }
    if (path === "/version") {
      return {
        status: 200,
        body: JSON.stringify({ ApiVersion: "1.41", MinAPIVersion: "1.24" }),
      };
    }
    return { status: 404, body: "" };
  };
  assert.equal(await negotiateDockerApiVersion(transport), "1.41");
});

test("negotiateDockerApiVersion fails when neither ping nor version reports API-Version", async () => {
  const transport: DockerTransport = async () => ({ status: 200, body: "OK", headers: {} });
  await assert.rejects(
    () => negotiateDockerApiVersion(transport),
    /did not report a usable API version/,
  );
});

test("createDockerApplyEngine caches the negotiated version and retries once on too old", async () => {
  let pingCount = 0;
  let createCount = 0;
  const calls: string[] = [];
  const transport: DockerTransport = async (method, requestPath) => {
    calls.push(`${method} ${requestPath}`);
    if (requestPath === "/_ping") {
      pingCount += 1;
      if (pingCount === 1) {
        return {
          status: 200,
          body: "OK",
          headers: { "Api-Version": "1.43", MinAPIVersion: "1.24" },
        };
      }
      return {
        status: 200,
        body: "OK",
        headers: { "Api-Version": "1.52", MinAPIVersion: "1.44" },
      };
    }
    if (requestPath.endsWith("/images/create?fromImage=example.com%2Fapi&tag=1.0.0") ||
        requestPath.includes("/images/create?")) {
      createCount += 1;
      if (createCount === 1) {
        return {
          status: 400,
          body: "client version 1.43 is too old. Minimum supported API version is 1.44",
        };
      }
      return { status: 200, body: "" };
    }
    return { status: 404, body: "" };
  };

  const engine = createDockerApplyEngine(transport);
  await engine.pullImage("example.com/api:1.0.0");
  await engine.pullImage("example.com/api:1.0.0");

  assert.equal(pingCount, 2);
  assert.ok(calls.includes("POST /v1.43/images/create?fromImage=example.com%2Fapi&tag=1.0.0"));
  assert.ok(calls.includes("POST /v1.52/images/create?fromImage=example.com%2Fapi&tag=1.0.0"));
  assert.equal(
    calls.filter((call) => call.startsWith("POST /v1.52/images/create")).length,
    2,
  );
});

test("createDockerApplyEngine uses the negotiated version for container calls", async () => {
  const calls: string[] = [];
  const transport: DockerTransport = async (method, requestPath) => {
    calls.push(`${method} ${requestPath}`);
    if (requestPath === "/_ping") {
      return {
        status: 200,
        body: "OK",
        headers: { "Api-Version": "1.44", MinAPIVersion: "1.44" },
      };
    }
    if (requestPath.includes("/containers/json")) {
      return {
        status: 200,
        body: JSON.stringify([{ Id: "api-id", Names: ["/okkey-api-1"], Image: "api:old" }]),
      };
    }
    if (requestPath.includes("/containers/api-id/json")) {
      return {
        status: 200,
        body: JSON.stringify({ Config: { Env: ["OKKEY_VERSION=1.4.0"] } }),
      };
    }
    return { status: 404, body: "" };
  };
  const engine = createDockerApplyEngine(transport);
  assert.equal(await engine.readRunningCoreVersion?.("okkey"), "1.4.0");
  assert.ok(calls.every((call) => call === "GET /_ping" || call.startsWith("GET /v1.44/")));
});

function pingTransport(headers: Record<string, string>): DockerTransport {
  return async (_method, path): Promise<DockerTransportResult> => {
    if (path === "/_ping") {
      return { status: 200, body: "OK", headers };
    }
    return { status: 404, body: "" };
  };
}
