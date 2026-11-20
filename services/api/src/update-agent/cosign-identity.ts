/**
 * Cosign keyless OIDC identity for update-agent image verification.
 *
 * Core defaults must stay identical to deploy/docker/install.sh
 * (OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP / OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP).
 * scripts/test/cosign-identity-regexp.test.mjs asserts that sync.
 *
 * Enterprise defaults match the enterprise installer's exported identity for
 * its publish-images workflow (release/*, hotfix/*, v* tags; not heads/dev).
 * An exported OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP replaces both.
 */

/** Core publish-images.yml on okkeyapp/okkey: heads/dev and tags/v<semver>. */
export const OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/(?:heads/dev|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Core + release/* and hotfix/* candidate refs. */
export const OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/(?:heads/dev|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+)$";

/**
 * Enterprise publish-images workflow identity.
 * Accepts release/*, hotfix/*, and tags/v<semver> only (not heads/dev by default).
 */
export const OKKEY_ENTERPRISE_COSIGN_DEFAULT_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey-enterprise/\\.github/workflows/publish-images\\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

export const OKKEY_COSIGN_DEFAULT_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

export type CosignImageKind = "core" | "enterprise";

export type CosignIdentityEnv = {
  OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP?: string;
  OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER?: string;
  OKKEY_ALLOW_CANDIDATE?: string;
};

export function resolveCosignOidcIssuer(env: CosignIdentityEnv = process.env): string {
  const override = env.OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER?.trim();
  return override && override.length > 0 ? override : OKKEY_COSIGN_DEFAULT_OIDC_ISSUER;
}

/**
 * Resolve the certificate identity regexp for cosign verify.
 * Operator override wins for both Core and Enterprise (same as install.sh).
 */
export function resolveCosignIdentityRegexp(
  kind: CosignImageKind,
  env: CosignIdentityEnv = process.env,
): string {
  const override = env.OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP?.trim();
  if (override && override.length > 0) {
    return override;
  }
  if (kind === "enterprise") {
    return OKKEY_ENTERPRISE_COSIGN_DEFAULT_IDENTITY_REGEXP;
  }
  if (isAllowCandidate(env)) {
    return OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP;
  }
  return OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP;
}

function isAllowCandidate(env: CosignIdentityEnv): boolean {
  return env.OKKEY_ALLOW_CANDIDATE === "1";
}
