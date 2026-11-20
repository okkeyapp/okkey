/**
 * Unit-test helpers for cosign. Production and e2e do not import the bypass.
 * Dedicated cosign tests clear the bypass and mock the process runner instead.
 */
import type { CosignProcessRunner } from "../src/update-agent/cosign-verify.ts";

export const TEST_COSIGN_OK: CosignProcessRunner = async () => ({
  code: 0,
  stdout: "verified",
  stderr: "",
});

/** Enable the test-only cosign bypass for api unit tests (not production). */
export function applyApiTestCosignBypass(): void {
  if (process.env.OKKEY_UPDATE_AGENT_COSIGN_TEST_BYPASS === undefined) {
    process.env.OKKEY_UPDATE_AGENT_COSIGN_TEST_BYPASS = "1";
  }
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "test";
  }
}

export function testDigestRef(image: string): string {
  if (image.includes("@sha256:")) {
    return image;
  }
  const digest = image.lastIndexOf("@");
  const withoutDigest = digest > 0 ? image.slice(0, digest) : image;
  const slash = withoutDigest.lastIndexOf("/");
  const colon = withoutDigest.lastIndexOf(":");
  const repo = colon > slash ? withoutDigest.slice(0, colon) : withoutDigest;
  return `${repo}@sha256:${"a".repeat(64)}`;
}
