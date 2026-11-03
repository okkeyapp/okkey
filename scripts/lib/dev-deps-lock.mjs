/**
 * Cross-process lock for local ensure scripts (yarn dev:api / dev:worker).
 * Exclusive create + PID stale recovery; no extra dependencies.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid(lockPath) {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function tryRemoveStaleLock(lockPath) {
  if (!existsSync(lockPath)) {
    return false;
  }
  const pid = readLockPid(lockPath);
  if (pid !== null && isProcessAlive(pid)) {
    return false;
  }
  try {
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function tryAcquireLock(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, `${process.pid}\n`);
    return fd;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      if (tryRemoveStaleLock(lockPath)) {
        return tryAcquireLock(lockPath);
      }
      return null;
    }
    throw error;
  }
}

function sleepMs(ms) {
  // Portable short sleep without busy-spinning the event loop in a sync script.
  spawnSync(process.execPath, ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms})`], {
    stdio: "ignore",
  });
}

/**
 * @param {string} lockPath
 * @param {() => void} fn
 * @param {{ timeoutMs?: number, pollMs?: number, onWait?: () => void }} [options]
 */
export function withDevDepsLock(lockPath, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const pollMs = options.pollMs ?? 200;
  const deadline = Date.now() + timeoutMs;
  let waited = false;

  while (Date.now() < deadline) {
    const fd = tryAcquireLock(lockPath);
    if (fd !== null) {
      try {
        fn();
      } finally {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          // Another process may have already cleaned up a stale lock.
        }
      }
      return;
    }
    if (!waited) {
      waited = true;
      options.onWait?.();
    }
    sleepMs(pollMs);
  }

  throw new Error(`Timed out waiting for lock: ${lockPath}`);
}
