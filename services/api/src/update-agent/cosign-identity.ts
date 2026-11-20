/**
 * Cosign keyless identity constants shared with deploy/docker/cosign-identity.sh.
 * Keep these strings identical; scripts/test/cosign-identity-regexp.test.mjs checks both.
 *
 * Default (Core and Enterprise): refs/tags/v*, refs/heads/release/*, refs/heads/hotfix/*.
 * refs/heads/dev requires OKKEY_COSIGN_ALLOW_DEV=1 (process env only).
 * OKKEY_ALLOW_CANDIDATE is a compatibility no-op (same set as default).
 */

/** Core: release/*, hotfix/*, SemVer tags — not heads/dev. */
export const OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Core default plus refs/heads/dev. */
export const OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Candidate alias — same as Core default (flag is a no-op). */
export const OKKEY_COSIGN_CANDIDATE_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Candidate+dev alias — same as Core default+dev. */
export const OKKEY_COSIGN_CANDIDATE_DEV_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey/\\.github/workflows/publish-images\\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Enterprise: same ref shapes as Core default on okkey-enterprise. */
export const OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey-enterprise/\\.github/workflows/publish-images\\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Enterprise default plus refs/heads/dev. */
export const OKKEY_COSIGN_ENTERPRISE_DEFAULT_DEV_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey-enterprise/\\.github/workflows/publish-images\\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Enterprise candidate alias — same as Enterprise default. */
export const OKKEY_COSIGN_ENTERPRISE_CANDIDATE_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey-enterprise/\\.github/workflows/publish-images\\.yml@refs/(?:heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

/** Enterprise candidate+dev alias — same as Enterprise default+dev. */
export const OKKEY_COSIGN_ENTERPRISE_CANDIDATE_DEV_IDENTITY_REGEXP =
  "^https://github\\.com/okkeyapp/okkey-enterprise/\\.github/workflows/publish-images\\.yml@refs/(?:heads/dev|heads/release/[0-9A-Za-z._-]+|heads/hotfix/[0-9A-Za-z._-]+|tags/v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$";

export const OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER_DEFAULT =
  "https://token.actions.githubusercontent.com";

export type CosignComponent = "okkey" | "enterprise";

export type CosignIdentitySettings = {
  identityRegexp: string;
  oidcIssuer: string;
};

/**
 * Resolve the cosign certificate identity.
 * Core: OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP (process env → .env → default/dev).
 * Enterprise: OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP (same precedence).
 * OKKEY_COSIGN_ALLOW_DEV is process-env only (a .env line does not enable heads/dev).
 * OKKEY_ALLOW_CANDIDATE is a no-op for the built-in sets (same as default).
 * When an explicit override is set together with ALLOW_DEV, the override must
 * already include heads/dev or resolution fails closed.
 */
export function resolveCosignIdentity(input: {
  component: CosignComponent;
  processEnv?: NodeJS.ProcessEnv;
  envFileContents?: string;
}): CosignIdentitySettings {
  const env = input.processEnv ?? process.env;
  const envFile = input.envFileContents ?? "";
  const allowDev = env.OKKEY_COSIGN_ALLOW_DEV === "1";

  let identityRegexp: string;
  if (input.component === "enterprise") {
    const override = firstNonEmpty(
      env.OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP,
      readEnvFileValue(envFile, "OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP"),
    );
    if (override) {
      assertAllowDevCompatible(override, allowDev, "OKKEY_ENTERPRISE_COSIGN_CERTIFICATE_IDENTITY_REGEXP");
      identityRegexp = override;
    } else {
      identityRegexp = allowDev
        ? OKKEY_COSIGN_ENTERPRISE_DEFAULT_DEV_IDENTITY_REGEXP
        : OKKEY_COSIGN_ENTERPRISE_DEFAULT_IDENTITY_REGEXP;
    }
  } else {
    const override = firstNonEmpty(
      env.OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP,
      readEnvFileValue(envFile, "OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP"),
    );
    if (override) {
      assertAllowDevCompatible(override, allowDev, "OKKEY_COSIGN_CERTIFICATE_IDENTITY_REGEXP");
      identityRegexp = override;
    } else {
      identityRegexp = allowDev
        ? OKKEY_COSIGN_DEFAULT_DEV_IDENTITY_REGEXP
        : OKKEY_COSIGN_DEFAULT_IDENTITY_REGEXP;
    }
  }

  const oidcIssuer =
    firstNonEmpty(
      env.OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER,
      readEnvFileValue(envFile, "OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER"),
    ) || OKKEY_COSIGN_CERTIFICATE_OIDC_ISSUER_DEFAULT;

  return { identityRegexp, oidcIssuer };
}

function assertAllowDevCompatible(override: string, allowDev: boolean, varName: string): void {
  if (allowDev && !override.includes("heads/dev")) {
    throw new Error(
      `OKKEY_COSIGN_ALLOW_DEV=1 has no effect while ${varName} is set without heads/dev. ` +
        `Include heads/dev in that regexp, or unset the override so the built-in allow-dev set applies.`,
    );
  }
}

export function readEnvFileValue(contents: string, key: string): string {
  for (const line of contents.split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) {
      return line.slice(key.length + 1).trim();
    }
  }
  return "";
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}
