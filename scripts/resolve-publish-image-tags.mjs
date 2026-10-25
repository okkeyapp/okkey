#!/usr/bin/env node
/**
 * Resolve GHCR image tags for Publish container images (img2).
 *
 * Tag scheme (release-and-images.md §3.2 / §3.4):
 *   push to `dev`          → :dev, :dev-<sha7>
 *   tag vX.Y.Z (clean)     → :X.Y.Z, :X.Y, :X   (:latest ONLY via manual dispatch)
 *   tag vX.Y.Z-prerelease  → :X.Y.Z-prerelease  (no rolling / :latest)
 *     e.g. v1.0.0-beta.2   → :1.0.0-beta.2 only
 *   pull_request           → :pr-<n>, :pr-<n>-<head-sha7>
 *   workflow_dispatch      → explicit tag (+ optional :latest when push_latest=true)
 *
 * Spelling: SemVer pre-release uses **beta** (never "betta").
 */

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * @typedef {object} ResolveContext
 * @property {string} eventName
 * @property {string} [ref]
 * @property {string} [refType]
 * @property {string} [refName]
 * @property {string} [sha]
 * @property {string} [prHeadSha]
 * @property {string|number} [prNumber]
 * @property {string} [dispatchTag]
 * @property {string|boolean} [dispatchLatest]
 * @property {string} [registry]
 * @property {string} [owner]
 */

const CLEAN_SEMVER_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+$/;

/**
 * @param {string} sha
 * @returns {string}
 */
export function short7(sha) {
  return String(sha || "").slice(0, 7);
}

/**
 * @param {string} image
 * @param {ResolveContext} ctx
 * @returns {string[]}
 */
export function tagsForImage(image, ctx) {
  const eventName = ctx.eventName;
  const ref = ctx.ref || "";
  const refType = ctx.refType || "";
  const refName = ctx.refName || "";

  if (eventName === "pull_request") {
    const revision = ctx.prHeadSha || ctx.sha || "";
    const short = short7(revision);
    const n = ctx.prNumber;
    return [`${image}:pr-${n}`, `${image}:pr-${n}-${short}`];
  }

  if (eventName === "push" && ref === "refs/heads/dev") {
    const short = short7(ctx.sha || "");
    return [`${image}:dev`, `${image}:dev-${short}`];
  }

  if (refType === "tag") {
    const version = refName.startsWith("v") ? refName.slice(1) : refName;
    /** @type {string[]} */
    const tags = [`${image}:${version}`];
    // Clean SemVer vX.Y.Z only → rolling :X.Y / :X.
    // Pre-release (e.g. v1.0.0-beta.2) must NOT get :1.0 / :1 / :latest.
    if (CLEAN_SEMVER_TAG.test(refName)) {
      const major = version.split(".")[0];
      const minorMajor = version.split(".").slice(0, 2).join(".");
      tags.push(`${image}:${minorMajor}`, `${image}:${major}`);
    }
    return tags;
  }

  if (eventName === "workflow_dispatch") {
    const dt = ctx.dispatchTag || "dev";
    /** @type {string[]} */
    const tags = [`${image}:${dt}`];
    const wantLatest =
      ctx.dispatchLatest === true || ctx.dispatchLatest === "true";
    if (wantLatest && dt !== "latest") {
      tags.push(`${image}:latest`);
    }
    return tags;
  }

  throw new Error(`Unsupported event for publish: ${eventName} ref=${ref}`);
}

/**
 * OCI org.opencontainers.image.version — SemVer without leading `v`.
 * @param {ResolveContext} ctx
 * @returns {string}
 */
export function resolveImageVersion(ctx) {
  if (ctx.eventName === "pull_request") {
    return `pr-${ctx.prNumber}`;
  }
  if (ctx.refType === "tag") {
    const refName = ctx.refName || "";
    return refName.startsWith("v") ? refName.slice(1) : refName;
  }
  if (ctx.eventName === "workflow_dispatch") {
    return ctx.dispatchTag || "dev";
  }
  if (ctx.eventName === "push" && ctx.ref === "refs/heads/dev") {
    return "dev";
  }
  return "dev";
}

/**
 * Assert beta.2 acceptance: only full pre-tag, never rolling / latest.
 * @param {string[]} tags
 * @param {string} image
 */
export function assertBeta2TagSet(tags, image) {
  const expected = [`${image}:1.0.0-beta.2`];
  const sorted = [...tags].sort();
  const expSorted = [...expected].sort();
  if (JSON.stringify(sorted) !== JSON.stringify(expSorted)) {
    throw new Error(
      `v1.0.0-beta.2 must publish only :1.0.0-beta.2 (got ${tags.join(",")})`,
    );
  }
  for (const forbidden of [
    `${image}:latest`,
    `${image}:1`,
    `${image}:1.0`,
    `${image}:1.0.0`,
  ]) {
    if (tags.includes(forbidden)) {
      throw new Error(`forbidden tag for beta.2: ${forbidden}`);
    }
  }
}

/**
 * @param {ResolveContext} ctx
 */
export function resolvePublishImages(ctx) {
  const registry = ctx.registry || "ghcr.io";
  const owner = ctx.owner || "okkeyapp";
  const imageApi = `${registry}/${owner}/api`;
  const imageWorker = `${registry}/${owner}/worker`;
  const imageWeb = `${registry}/${owner}/web`;

  let revision = ctx.sha || "";
  if (ctx.eventName === "pull_request") {
    revision = ctx.prHeadSha || revision;
  }

  const tagsApi = tagsForImage(imageApi, ctx);
  const tagsWorker = tagsForImage(imageWorker, ctx);
  const tagsWeb = tagsForImage(imageWeb, ctx);

  if (ctx.refType === "tag" && ctx.refName === "v1.0.0-beta.2") {
    assertBeta2TagSet(tagsApi, imageApi);
    assertBeta2TagSet(tagsWorker, imageWorker);
    assertBeta2TagSet(tagsWeb, imageWeb);
  }

  return {
    revision,
    imageVersion: resolveImageVersion(ctx),
    imageApi,
    imageWorker,
    imageWeb,
    tagsApi,
    tagsWorker,
    tagsWeb,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ResolveContext}
 */
export function contextFromEnv(env = process.env) {
  return {
    eventName: env.EVENT_NAME || "",
    ref: env.REF || "",
    refType: env.REF_TYPE || "",
    refName: env.REF_NAME || "",
    sha: env.SHA || "",
    prHeadSha: env.PR_HEAD_SHA || "",
    prNumber: env.PR_NUMBER || "",
    dispatchTag: env.DISPATCH_TAG || "",
    dispatchLatest: env.DISPATCH_LATEST || "",
    registry: env.REGISTRY || "ghcr.io",
    owner: env.OWNER || "okkeyapp",
  };
}

/**
 * @param {ReturnType<typeof resolvePublishImages>} resolved
 * @param {string} outPath
 */
export function writeGithubOutput(resolved, outPath) {
  const lines = [
    `revision=${resolved.revision}`,
    `image_version=${resolved.imageVersion}`,
    `image_api=${resolved.imageApi}`,
    `image_worker=${resolved.imageWorker}`,
    `image_web=${resolved.imageWeb}`,
    `tags_api=${resolved.tagsApi.join(",")}`,
    `tags_worker=${resolved.tagsWorker.join(",")}`,
    `tags_web=${resolved.tagsWeb.join(",")}`,
  ];
  appendFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const ctx = contextFromEnv();
  const resolved = resolvePublishImages(ctx);
  const outPath = process.env.GITHUB_OUTPUT;
  if (outPath) {
    writeGithubOutput(resolved, outPath);
  }
  process.stdout.write(
    [
      `Revision: ${resolved.revision}`,
      `OCI version: ${resolved.imageVersion}`,
      `api tags: ${resolved.tagsApi.join(",")}`,
      `worker tags: ${resolved.tagsWorker.join(",")}`,
      `web tags: ${resolved.tagsWeb.join(",")}`,
      "",
    ].join("\n"),
  );
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
