import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflow = readFileSync(join(root, ".github/workflows/publish-images.yml"), "utf8");

function jobBlock(name) {
  const marker = `\n  ${name}:`;
  const start = workflow.indexOf(marker);
  assert.ok(start > 0, `job ${name} not found`);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n  [a-z0-9-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

test("version tags publish a signed core feed after images, and betas are not pre-releases", () => {
  const job = jobBlock("publish-core-update-feed");
  assert.match(job, /needs: \[prep, merge\]/);
  assert.match(
    job,
    /github\.event_name == 'push' && github\.ref_type == 'tag' && startsWith\(github\.ref, 'refs\/tags\/v'\)/,
  );
  assert.match(job, /contents: write/);
  assert.match(job, /secrets\.OKKEY_CORE_RELEASE_SIGNING_KEY/);
  assert.match(
    job,
    /Secret OKKEY_CORE_RELEASE_SIGNING_KEY is not set\. Refusing to build or publish an unsigned core update package or feed\.json\./,
  );
  assert.match(job, /Refusing to publish an unsigned core package\./);
  const requireAt = job.indexOf("name: Require core release signing key");
  const buildAt = job.indexOf("name: Build and sign the core offline package");
  const uploadAt = job.indexOf("name: Upload feed.json and the core package");
  const releaseAt = job.indexOf("gh release ");
  assert.ok(requireAt > 0 && buildAt > requireAt && uploadAt > buildAt && releaseAt > uploadAt);
  assert.match(job, /build-core-release-package\.ts/);
  assert.match(job, /releases\/download\/\$\{RELEASE_TAG\}\/okkey-\$\{IMAGE_VERSION\}\.okpkg/);
  assert.match(job, /feed\.json/);
  assert.match(job, /--clobber/);
  assert.match(job, /--verify-tag/);
  assert.match(job, /-F prerelease=false/);
  assert.match(job, /make_latest=/);
  assert.match(job, /releases\/latest/);
  assert.doesNotMatch(job, /--prerelease/);
  assert.doesNotMatch(job, /OKKEY_CORE_RELEASE_SIGNING_KEY.*echo|echo.*OKKEY_CORE_RELEASE_SIGNING_KEY=/);
  const schedule = jobBlock("gc-ephemeral-tags");
  assert.doesNotMatch(schedule, /build-core-release-package/);
});
