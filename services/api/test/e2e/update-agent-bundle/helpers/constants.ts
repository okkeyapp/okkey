import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = path.resolve(here, "../fixtures");
export const REPO_ROOT = path.resolve(here, "../../../../../..");

export const PROJECT = "okkey-e2e-bundle";
export const REGISTRY_HOST = "127.0.0.1:5000";
export const IMAGE_REPO = `${REGISTRY_HOST}/okkey-e2e/stub`;

export const BASE_TAG = "1.0.0";
export const CORE_TAG = "1.2.0";
export const ENTERPRISE_TAG = "2.0.0";
export const ENTERPRISE_BAD_TAG = "2.0.0-bad";

export const BASE_IMAGE = `${IMAGE_REPO}:${BASE_TAG}`;
export const CORE_IMAGE = `${IMAGE_REPO}:${CORE_TAG}`;
export const ENTERPRISE_IMAGE = `${IMAGE_REPO}:${ENTERPRISE_TAG}`;
export const ENTERPRISE_BAD_IMAGE = `${IMAGE_REPO}:${ENTERPRISE_BAD_TAG}`;

/** Production compose services (core and enterprise both target these). */
export const CORE_SERVICES = ["api", "web", "worker"] as const;

/** Signed-package image keys for enterprise packages. */
export const ENTERPRISE_PACKAGE_KEYS = [
  "enterprise-api",
  "enterprise-web",
  "enterprise-worker",
] as const;

export const ALL_SERVICES = [...CORE_SERVICES] as const;

export const AGENT_TOKEN = "e2e-update-agent-token";
