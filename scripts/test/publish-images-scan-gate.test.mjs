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

test("Trivy fails the job on CRITICAL and HIGH and loads generated ignores", () => {
  for (const name of ["scan-amd64", "scan-arm64"]) {
    const job = jobBlock(name);
    assert.match(
      job,
      /aquasecurity\/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0\.36\.0/,
    );
    assert.match(job, /severity: CRITICAL,HIGH/);
    assert.match(job, /exit-code: "1"/);
    assert.match(job, /ignore-unfixed: "false"/);
    assert.match(job, /scanners: vuln/);
    assert.match(job, /trivyignores: \.trivyignore/);
    assert.match(job, /scripts\/render-trivy-ignore\.mjs/);
    assert.match(job, /\.github\/security\/cve-exceptions\.yaml/);
    assert.equal(job.split("image: [api, worker, web]").length - 1, 1);
  }

  // buildx digests are OCI indexes; trivy-action v0.36.0 has no platform
  // input, so each arch scan must set TRIVY_PLATFORM for that arch.
  assert.match(jobBlock("scan-amd64"), /TRIVY_PLATFORM:\s*linux\/amd64/);
  assert.match(jobBlock("scan-arm64"), /TRIVY_PLATFORM:\s*linux\/arm64/);
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
      // Internal stage alias (e.g. FROM runtime AS api) — not a registry image.
      if (image === "runtime") continue;
      // Docker built-in empty base: no registry digest exists or is required.
      // Third-party content must still enter via digest-pinned FROM / COPY --from.
      if (image === "scratch") continue;
      assert.match(image, /@sha256:[a-f0-9]{64}$/, `${file} ${image}`);
    }
    // External COPY --from=registry/image@sha256:… must be digest-pinned too
    // (stage names like assemble / prod-deps have no registry ref).
    for (const match of text.matchAll(/^COPY\s+--from=(\S+)/gm)) {
      const image = match[1];
      if (!/[:@/]/.test(image)) continue;
      assert.match(
        image,
        /@sha256:[a-f0-9]{64}/,
        `${file} COPY --from=${image}`,
      );
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
