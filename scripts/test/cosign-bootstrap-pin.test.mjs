/**
 * Keep Node cosign bootstrap pins identical to scripts/ci/install-cosign.sh.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const installSh = readFileSync(join(root, "scripts/ci/install-cosign.sh"), "utf8");
const bootstrapTs = readFileSync(
  join(root, "services/api/src/update-agent/cosign-bootstrap.ts"),
  "utf8",
);

function shChecksum(asset) {
  const block = installSh.match(
    new RegExp(`${asset}\\)\\s*\\n\\s*(?:#.*\\n\\s*)?echo "([a-f0-9]{64})"`, "m"),
  );
  assert.ok(block, `missing checksum for ${asset}`);
  return block[1];
}

test("cosign-bootstrap.ts pins match install-cosign.sh", () => {
  assert.match(installSh, /VERSION="\$\{COSIGN_VERSION:-2\.5\.3\}"/);
  assert.match(bootstrapTs, /export const COSIGN_VERSION = "2\.5\.3"/);
  const amd = shChecksum("cosign-linux-amd64");
  const arm = shChecksum("cosign-linux-arm64");
  assert.match(bootstrapTs, new RegExp(`amd64:\\s*"${amd}"`));
  assert.match(bootstrapTs, new RegExp(`arm64:\\s*"${arm}"`));
});
