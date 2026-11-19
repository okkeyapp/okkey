import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflow = readFileSync(
  join(root, ".github/workflows/publish-images.yml"),
  "utf8",
);
const prWorkflow = readFileSync(
  join(root, ".github/workflows/pr-image-scan.yml"),
  "utf8",
);
const trivyAction = readFileSync(
  join(root, ".github/actions/trivy-scan-image/action.yml"),
  "utf8",
);

function jobBlock(name) {
  const marker = `\n  ${name}:`;
  const start = workflow.indexOf(marker);
  assert.ok(start > 0, `job ${name} not found`);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n  [a-z0-9-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

test("scan jobs sit between digest builds and manifest tags / cosign", () => {
  const scanAmd = jobBlock("scan-amd64");
  const scanArm = jobBlock("scan-arm64");
  const merge = jobBlock("merge");
  const gc = jobBlock("gc-ephemeral-tags");

  assert.match(scanAmd, /needs: \[prep, build-amd64\]/);
  assert.match(
    scanAmd,
    /needs\.build-amd64\.result == 'success' && needs\.prep\.outputs\.want_amd64 == 'true'/,
  );
  assert.match(scanArm, /needs: \[prep, build-arm64\]/);
  assert.match(
    scanArm,
    /needs\.build-arm64\.result == 'success' && needs\.prep\.outputs\.want_arm64 == 'true'/,
  );

  assert.match(
    merge,
    /needs: \[prep, build-amd64, build-arm64, scan-amd64, scan-arm64\]/,
  );
  assert.match(
    merge,
    /needs\.scan-amd64\.result == needs\.build-amd64\.result/,
  );
  assert.match(
    merge,
    /needs\.scan-arm64\.result == needs\.build-arm64\.result/,
  );
  assert.match(
    merge,
    /needs\.scan-amd64\.result == 'success' \|\| needs\.scan-arm64\.result == 'success'/,
  );

  const tagAt = merge.indexOf("name: Create manifest list and push");
  const signAt = merge.indexOf("name: Sign images (cosign keyless OIDC)");
  assert.ok(tagAt > 0 && signAt > tagAt);

  assert.doesNotMatch(gc, /trivy/i);
  assert.doesNotMatch(gc, /scan-amd64/);
  assert.match(workflow, /cron: "17 3 \* \* \*"/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /branches:\s*\n\s*- dev\b/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test("shared Trivy action fails on CRITICAL and HIGH and loads generated ignores", () => {
  assert.match(
    trivyAction,
    /aquasecurity\/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0\.36\.0/,
  );
  assert.match(trivyAction, /severity: CRITICAL,HIGH/);
  assert.match(trivyAction, /exit-code: "1"/);
  assert.match(trivyAction, /ignore-unfixed: "false"/);
  assert.match(trivyAction, /scanners: vuln/);
  assert.match(trivyAction, /trivyignores: \.trivyignore/);
  assert.match(trivyAction, /inputs\.render-script/);
  assert.match(trivyAction, /cve-exceptions\.yaml/);

  for (const name of ["scan-amd64", "scan-arm64"]) {
    const job = jobBlock(name);
    assert.match(job, /\.\/\.github\/actions\/trivy-scan-image/);
    assert.match(job, /scripts\/render-trivy-ignore\.mjs/);
    assert.match(job, /\.github\/security\/cve-exceptions\.yaml/);
    assert.match(job, /\.github\/actions\/trivy-scan-image/);
    assert.equal(job.split("image: [api, worker, web]").length - 1, 1);
  }

  // buildx digests are OCI indexes; trivy-action v0.36.0 has no platform
  // input, so each arch scan must set TRIVY_PLATFORM for that arch.
  assert.match(jobBlock("scan-amd64"), /platform:\s*linux\/amd64/);
  assert.match(jobBlock("scan-arm64"), /platform:\s*linux\/arm64/);
});

test("PR image scan builds local amd64 tars and reuses the shared Trivy action", () => {
  assert.match(prWorkflow, /name: PR image scan/);
  assert.match(prWorkflow, /pull_request:/);
  assert.match(prWorkflow, /branches:\s*\n\s*- dev\n\s*- "release\/\*\*"/);
  // No trigger-level paths filter: required checks must not stay Pending on
  // docs-only PRs. Relevance is detected inside the workflow instead.
  {
    const onBlock = prWorkflow.match(/^on:\n([\s\S]*?)(?=^permissions:)/m);
    assert.ok(onBlock, "expected on: block before permissions");
    assert.doesNotMatch(onBlock[1], /^\s+paths:\s*$/m);
  }
  assert.match(
    prWorkflow,
    /dorny\/paths-filter@de90cc6fb38fc0963ad72b210f1f284cd68cea36 # v3\.0\.2/,
  );
  assert.match(prWorkflow, /name: detect-image-paths/);
  assert.match(prWorkflow, /outputs:\s*\n\s*images:/);
  assert.match(prWorkflow, /build-and-scan \(\$\{\{ matrix\.image \}\}\)/);
  assert.match(prWorkflow, /needs: changes/);
  // Job-level skip would report Skipped and break required checks; gate steps.
  assert.doesNotMatch(
    prWorkflow,
    /build-and-scan:[\s\S]*?\n    if: needs\.changes/,
  );
  assert.match(prWorkflow, /needs\.changes\.outputs\.images == 'true'/);
  assert.match(prWorkflow, /needs\.changes\.outputs\.images != 'true'/);
  assert.match(prWorkflow, /platforms: linux\/amd64/);
  assert.match(prWorkflow, /push:\s*false/);
  assert.match(prWorkflow, /type=docker,dest=\/tmp\/okkey-\$\{\{ matrix\.image \}\}\.tar/);
  assert.doesNotMatch(prWorkflow, /docker\/login-action/);
  assert.match(
    prWorkflow,
    /permissions:\s*\n\s*contents: read\s*\n\s*actions: write/,
  );
  assert.doesNotMatch(prWorkflow, /^\s*packages:\s*write\s*$/m);
  assert.doesNotMatch(prWorkflow, /push:\s*true/);
  assert.match(prWorkflow, /\.\/\.github\/actions\/trivy-scan-image/);
  assert.match(prWorkflow, /input:\s*\/tmp\/okkey-\$\{\{ matrix\.image \}\}\.tar/);
  assert.match(prWorkflow, /table-output:/);
  assert.match(prWorkflow, /sarif-output:/);
  assert.match(prWorkflow, /Upload Trivy reports/);
  assert.match(
    prWorkflow,
    /OKKEY_GIT_SHA=\$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
  );
  assert.match(
    prWorkflow,
    /NODE_VERSION=25\n\s*RUST_TOOLCHAIN=1\.86\.0\n\s*WASM_PACK_VERSION=0\.13\.1/,
  );
  // Same GHA cache scopes as publish amd64 builds.
  assert.match(prWorkflow, /scope=\$\{\{ matrix\.cache_scope \}\}-linux-amd64/);
  assert.match(prWorkflow, /cache_scope: services-api/);
  assert.match(prWorkflow, /cache_scope: web/);
});

test("web runtime pins nginx alpine-slim at or above 1.30.7 for Trivy (TSK-293)", () => {
  const text = readFileSync(join(root, "apps/web/Dockerfile"), "utf8");
  const runtimeFrom = [...text.matchAll(/^FROM\s+(\S+)\s+AS\s+runtime\s*$/gm)].map(
    (match) => match[1],
  );
  assert.equal(runtimeFrom.length, 1, "expected one runtime FROM");
  // Official nginx:<ver>-alpine-slim channel; reject older 1.30.6 pins that
  // ship nginx < 1.30.7-r0 (CRITICAL/HIGH CVEs on the publish gate).
  assert.match(
    runtimeFrom[0],
    /^nginx:1\.30\.(?:[7-9]|[1-9][0-9]+)-alpine-slim@sha256:[a-f0-9]{64}$/,
  );
  assert.doesNotMatch(text, /^\s*RUN\s+.*\bapk\s+upgrade\b/m);
});

test("third-party Dockerfile and compose images are digest pinned", () => {
  const dockerfiles = [
    "services/api/Dockerfile",
    "apps/web/Dockerfile",
    "services/geoip-updater/Dockerfile",
    "deploy/docker/proxy/nginx/Dockerfile",
  ];
  for (const file of dockerfiles) {
    const text = readFileSync(join(root, file), "utf8");
    const froms = [...text.matchAll(/^FROM\s+(\S+)/gm)].map((match) => match[1]);
    assert.ok(froms.length > 0, file);
    for (const image of froms) {
      if (image === "runtime") continue;
      assert.match(image, /@sha256:[a-f0-9]{64}$/, `${file} ${image}`);
    }
  }

  const composeFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/compose.*\.ya?ml$/.test(entry.name) || entry.name.startsWith("docker-compose")) {
        composeFiles.push(path);
      }
    }
  };
  walk(root);
  assert.ok(composeFiles.length >= 3);
  for (const file of composeFiles) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/^\s*image:\s*(\S+)\s*$/gm)) {
      const image = match[1];
      if (image.includes("ghcr.io/okkeyapp/")) continue;
      if (image.includes("okkey-edge-nginx") || image.includes("okkey-saas-edge-nginx")) {
        continue;
      }
      assert.match(image, /@sha256:[a-f0-9]{64}/, `${file} ${image}`);
    }
  }
});
