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

test("created timestamp format is RFC 3339 UTC and version is required", () => {
  assert.equal(count(workflow, "date -u +%Y-%m-%dT%H:%M:%SZ"), 1);
  assert.match(workflow, /resolver did not emit image_version/);
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
