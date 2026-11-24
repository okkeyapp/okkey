/**
 * Runtime permission contract for the compose update-agent service.
 *
 * The api image runs as distroless nonroot (65532). The update agent must still
 * rewrite host-owned /okkey/.env (typically mode 644) and open docker.sock
 * (root:docker 0660). Compose therefore sets user "0:0" for update-agent only.
 *
 * This probe uses a disposable Alpine container so the check does not depend on
 * building the api image. Skip when Docker is unavailable.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ALPINE = "alpine:3.20";

function dockerAvailable(): boolean {
  const probe = spawnSync("docker", ["info"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  return probe.status === 0;
}

/**
 * Host dockerd resolves bind-mount sources on the host filesystem. When this
 * suite runs inside a container that bind-mounts the repo (local nested runs),
 * set OKKEY_DOCKER_BIND_ROOT to the host path of process.cwd() so `-v` targets
 * the same directory the test process writes into.
 */
function dockerBindPath(containerPath: string): string {
  const bindRoot = process.env.OKKEY_DOCKER_BIND_ROOT?.trim();
  if (!bindRoot) {
    return containerPath;
  }
  const rel = path.relative(process.cwd(), containerPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return containerPath;
  }
  return path.join(bindRoot, rel);
}

function dockerRun(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("docker", ["run", "--rm", ...args], {
    encoding: "utf8",
    timeout: 60_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("nonroot cannot rewrite host .env or a 0660 socket; root can", async (t) => {
  if (!dockerAvailable()) {
    t.skip("docker is not available");
    return;
  }

  // Bind mounts are resolved by the host dockerd. Keep the probe dir under the
  // gitignored .tmp/ tree so nested local runs (repo bind-mounted into a Node
  // container) still share a host-visible path with dockerd.
  const tmpRoot = path.join(process.cwd(), ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const installDir = mkdtempSync(path.join(tmpRoot, "okkey-ua-perms-"));
  const envPath = path.join(installDir, ".env");
  try {
    writeFileSync(envPath, "OKKEY_IMAGE_TAG=1.0.0\n", { mode: 0o644 });

    // Ensure the alpine image is present before the timed probes.
    const pull = spawnSync("docker", ["pull", ALPINE], {
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(pull.status, 0, pull.stderr);

    // Model docker.sock (root:docker 0660) with a root-owned 0660 file. Host
    // socket modes vary in CI; the permission class is what the agent needs.
    const hostInstallDir = dockerBindPath(installDir);

    const seed = dockerRun([
      "--user",
      "0:0",
      "-v",
      `${hostInstallDir}:/okkey`,
      ALPINE,
      "sh",
      "-c",
      "install -m 0660 -o 0 -g 0 /dev/null /okkey/docker.sock.probe",
    ]);
    assert.equal(seed.status, 0, seed.stderr);

    const nonroot = dockerRun([
      "--user",
      "65532:65532",
      "-v",
      `${hostInstallDir}:/okkey`,
      ALPINE,
      "sh",
      "-c",
      [
        "set +e",
        "echo OKKEY_IMAGE_TAG=broken > /okkey/.env",
        "env_rc=$?",
        "test -w /okkey/docker.sock.probe",
        "sock_writable=$?",
        'echo "env_rc=$env_rc sock_writable=$sock_writable"',
        "exit 0",
      ].join("; "),
    ]);
    assert.equal(nonroot.status, 0, nonroot.stderr);
    assert.match(nonroot.stdout, /env_rc=1/);
    assert.match(nonroot.stdout, /sock_writable=1/);
    assert.equal(readFileSync(envPath, "utf8"), "OKKEY_IMAGE_TAG=1.0.0\n");

    const root = dockerRun([
      "--user",
      "0:0",
      "-v",
      `${hostInstallDir}:/okkey`,
      ALPINE,
      "sh",
      "-c",
      [
        "set -e",
        "echo OKKEY_IMAGE_TAG=1.1.0 > /okkey/.env",
        "test -w /okkey/docker.sock.probe",
        'echo "root_ok"',
      ].join("; "),
    ]);
    assert.equal(root.status, 0, `${root.stdout}\n${root.stderr}`);
    assert.match(root.stdout, /root_ok/);
    assert.equal(readFileSync(envPath, "utf8"), "OKKEY_IMAGE_TAG=1.1.0\n");
  } finally {
    rmSync(installDir, { recursive: true, force: true });
  }
});
