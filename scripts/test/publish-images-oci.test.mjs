import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflow = readFileSync(
  join(root, ".github/workflows/publish-images.yml"),
  "utf8",
);

const OCI_KEYS = [
  "org.opencontainers.image.title",
  "org.opencontainers.image.description",
  "org.opencontainers.image.vendor",
  "org.opencontainers.image.source",
  "org.opencontainers.image.revision",
  "org.opencontainers.image.version",
  "org.opencontainers.image.created",
  "org.opencontainers.image.licenses",
];

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test("publish workflow sets every OCI annotation key on labels, manifests, and the index", () => {
  // Two arch builds × (config label + index,manifest annotation) + imagetools index.
  for (const key of OCI_KEYS) {
    assert.equal(count(workflow, key), 5, key);
  }
  assert.equal(
    count(workflow, "index,manifest:org.opencontainers.image.version="),
    2,
  );
  assert.equal(
    count(workflow, "index,manifest:org.opencontainers.image.created="),
    2,
  );
  assert.match(workflow, /add_ann org\.opencontainers\.image\.version /);
  assert.match(workflow, /add_ann org\.opencontainers\.image\.created /);
  assert.match(
    workflow,
    /org\.opencontainers\.image\.version=\$\{\{ needs\.prep\.outputs\.image_version \}\}/,
  );
  assert.match(
    workflow,
    /org\.opencontainers\.image\.created=\$\{\{ needs\.prep\.outputs\.image_created \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /org\.opencontainers\.image\.version=\$\{\{ github\.ref_name \}\}/,
  );
});

test(":dev is refused unless the workflow ref is refs/heads/dev", () => {
  assert.match(
    workflow,
    /refusing to publish or sign the :dev channel from/,
  );
  assert.match(workflow, /workflow_dispatch for :dev must run on refs\/heads\/dev/);
  assert.match(workflow, /0\.0\.0-dev/);
});

test("created timestamp format is RFC 3339 UTC and version is required", () => {
  assert.equal(count(workflow, "date -u +%Y-%m-%dT%H:%M:%SZ"), 1);
  assert.match(workflow, /resolver did not emit image_version/);
  assert.match(workflow, /OCI version must not keep a leading v/);
  assert.match(workflow, /missing OCI version, created, revision, or source/);
});

test("v* tag images are signed keyless with SBOM and provenance kept", () => {
  assert.match(workflow, /tags:\s*\n\s*- "v\*"/);
  assert.equal(count(workflow, "provenance: mode=max"), 2);
  assert.equal(count(workflow, "sbom: true"), 2);
  assert.doesNotMatch(workflow, /provenance:\s*false/);
  assert.doesNotMatch(workflow, /sbom:\s*false/);
  assert.doesNotMatch(workflow, /continue-on-error/);

  const signAt = workflow.indexOf("name: Sign images (cosign keyless OIDC)");
  assert.ok(signAt > 0);
  const signBlock = workflow.slice(signAt, signAt + 900);
  assert.match(signBlock, /if: github\.event_name != 'pull_request'/);
  assert.match(signBlock, /cosign sign "\$\{REF\}"/);
  assert.match(signBlock, /refusing to sign without an index digest/);
  assert.doesNotMatch(signBlock, /continue-on-error/);
  assert.doesNotMatch(signBlock, /workflow_dispatch/);
});

test("api/worker image build bakes OKKEY_GIT_SHA from the publish revision", () => {
  const dockerfile = readFileSync(join(root, "services/api/Dockerfile"), "utf8");
  // ARG/ENV must be on the final runtime stage (api/worker inherit it).
  // A prior intermediate stage (prod-deps) must not be the only place they appear.
  const runtimeIdx = dockerfile.search(/^FROM .+ AS runtime$/m);
  assert.ok(runtimeIdx >= 0, "Dockerfile must declare an AS runtime stage");
  const apiIdx = dockerfile.indexOf("\nFROM runtime AS api", runtimeIdx);
  assert.ok(apiIdx > runtimeIdx, "api target must inherit FROM runtime");
  const runtimeStage = dockerfile.slice(runtimeIdx, apiIdx);
  assert.match(runtimeStage, /^ARG OKKEY_GIT_SHA=$/m);
  assert.match(runtimeStage, /^ENV OKKEY_GIT_SHA=\$\{OKKEY_GIT_SHA\}$/m);
  assert.equal(count(dockerfile, "ARG OKKEY_GIT_SHA="), 1);
  assert.equal(count(dockerfile, "ENV OKKEY_GIT_SHA=${OKKEY_GIT_SHA}"), 1);
  assert.match(runtimeStage, /^ARG OKKEY_ENTERPRISE_GIT_SHA=$/m);
  assert.match(runtimeStage, /^ENV OKKEY_ENTERPRISE_GIT_SHA=\$\{OKKEY_ENTERPRISE_GIT_SHA\}$/m);
  assert.equal(count(dockerfile, "ARG OKKEY_ENTERPRISE_GIT_SHA="), 1);
  assert.equal(count(dockerfile, "ENV OKKEY_ENTERPRISE_GIT_SHA=${OKKEY_ENTERPRISE_GIT_SHA}"), 1);

  // Both amd64 and arm64 build jobs pass the revision as a build-arg and then
  // inspect Config.Env on the pushed final image (not an intermediate stage).
  assert.equal(
    count(workflow, "OKKEY_GIT_SHA=${{ needs.prep.outputs.revision }}"),
    2,
  );
  assert.match(workflow, /Assert OKKEY_GIT_SHA is baked into api\/worker image/);
  assert.match(workflow, /OKKEY_GIT_SHA=\$\{EXPECTED_SHA\} not found in image Env/);
  assert.match(workflow, /docker image inspect "\$\{REF\}" --format '\{\{json \.Config\.Env\}\}'/);

  const compose = readFileSync(join(root, "deploy/docker/docker-compose.prod.yml"), "utf8");
  // An empty compose assignment would override the image ENV at runtime.
  assert.doesNotMatch(compose, /^\s*OKKEY_GIT_SHA\s*:/m);
  assert.doesNotMatch(compose, /^\s*OKKEY_ENTERPRISE_GIT_SHA\s*:/m);
});
