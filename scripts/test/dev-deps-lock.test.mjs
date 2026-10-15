import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withDevDepsLock } from "../lib/dev-deps-lock.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("withDevDepsLock serializes concurrent holders", async () => {
  const dir = mkdtempSync(join(tmpdir(), "okkey-dev-deps-lock-"));
  const lockPath = join(dir, "ensure.lock");
  const markerPath = join(dir, "order.txt");
  writeFileSync(markerPath, "", "utf8");

  const workerScript = `
    import { appendFileSync } from "node:fs";
    import { withDevDepsLock } from ${JSON.stringify(join(root, "scripts/lib/dev-deps-lock.mjs"))};
    withDevDepsLock(${JSON.stringify(lockPath)}, () => {
      appendFileSync(${JSON.stringify(markerPath)}, "enter:" + process.env.WORKER_ID + "\\n");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
      appendFileSync(${JSON.stringify(markerPath)}, "leave:" + process.env.WORKER_ID + "\\n");
    }, { pollMs: 50 });
  `;

  const runWorker = (id) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", workerScript], {
        env: { ...process.env, WORKER_ID: id },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`worker ${id} exited ${code}: ${stderr}`));
        }
      });
    });

  try {
    await Promise.all([runWorker("a"), runWorker("b")]);
    const order = readFileSync(markerPath, "utf8").trim().split("\n");
    assert.equal(order.length, 4);
    assert.equal(order[0].startsWith("enter:"), true);
    assert.equal(order[1], order[0].replace("enter:", "leave:"));
    assert.equal(order[2].startsWith("enter:"), true);
    assert.equal(order[3], order[2].replace("enter:", "leave:"));
    assert.notEqual(order[0], order[2]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withDevDepsLock recovers a stale lock from a dead pid", () => {
  const dir = mkdtempSync(join(tmpdir(), "okkey-dev-deps-stale-"));
  const lockPath = join(dir, "ensure.lock");
  writeFileSync(lockPath, "999999991\n", "utf8");

  let ran = false;
  try {
    withDevDepsLock(lockPath, () => {
      ran = true;
    }, { pollMs: 20, timeoutMs: 2000 });
    assert.equal(ran, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensure-api-dev-deps script imports lock helper", () => {
  const scriptPath = join(root, "scripts", "ensure-api-dev-deps.mjs");
  const source = readFileSync(scriptPath, "utf8");
  assert.match(source, /withDevDepsLock/);
  assert.match(source, /ensure-api-dev-deps\.lock/);
  // Smoke: module parses under current Node.
  const result = spawnSync(process.execPath, ["--check", scriptPath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});
