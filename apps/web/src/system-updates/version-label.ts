const SHA = /^[0-9a-f]{7,64}$/i;
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const SHORT_SHA_LEN = 8;

export type SidebarVersionLabel = {
  /** Visible sidebar text, for example `v1.0.0-beta.3` or `v1.0.0-beta.3 (2bf668f3)`. */
  label: string;
  /**
   * Full okkey-repo commit when known (also used for `data-commit-sha`).
   * Comes from API `commitSha` / `OKKEY_GIT_SHA`, not a packaging revision.
   */
  tooltip: string | null;
  /**
   * Full enterprise-repo commit when known (also used for `data-enterprise-commit-sha`).
   * Comes from API `enterpriseCommitSha` / `OKKEY_ENTERPRISE_GIT_SHA`.
   */
  enterpriseTooltip: string | null;
};

/**
 * Sidebar button text is the version, plus short commit SHA(s) in parentheses
 * when known. With only the core SHA: `v1.0.0 (2bf668f3)`.
 * When an enterprise SHA is also present: `v1.0.0 (core 2bf668f3 · enterprise abcdef01)`.
 * A tagged build and a plain version string both show `v<semver>`.
 * A version that is only a commit SHA uses the dev-channel version `0.0.0-dev`.
 * When every SHA is empty or invalid, the label is the version only (no empty parentheses).
 */
export function formatSidebarVersionLabel(input: {
  version: string;
  commitSha?: string | null;
  enterpriseCommitSha?: string | null;
  releaseTag?: string | null;
}): SidebarVersionLabel {
  const release = releaseSemver(input.releaseTag);
  const parsed = release
    ? { version: release, sha: normalizeSha(input.commitSha) }
    : splitVersionAndSha(input.version, input.commitSha);
  const enterpriseSha = normalizeSha(input.enterpriseCommitSha);

  return {
    label: formatVersionWithCommitShas({
      version: displayVersion(parsed.version),
      commitSha: parsed.sha,
      enterpriseCommitSha: enterpriseSha,
      shortShaLen: SHORT_SHA_LEN,
    }),
    tooltip: parsed.sha,
    enterpriseTooltip: enterpriseSha,
  };
}

/**
 * Append short commit SHA(s) in parentheses when present.
 * Core only → `version (abcdef01)`.
 * Core + enterprise → `version (core abcdef01 · enterprise 12345678)`.
 * Enterprise only → `version (enterprise 12345678)`.
 * Neither → `version`.
 */
export function formatVersionWithCommitShas(input: {
  version: string;
  commitSha?: string | null;
  enterpriseCommitSha?: string | null;
  shortShaLen?: number;
}): string {
  const version = input.version;
  const len = input.shortShaLen ?? SHORT_SHA_LEN;
  const core = shortenSha(input.commitSha, len);
  const enterprise = shortenSha(input.enterpriseCommitSha, len);
  if (core && enterprise) {
    return `${version} (core ${core} · enterprise ${enterprise})`;
  }
  if (core) {
    return `${version} (${core})`;
  }
  if (enterprise) {
    return `${version} (enterprise ${enterprise})`;
  }
  return version;
}

function shortenSha(value: string | null | undefined, len: number): string | null {
  const sha = normalizeSha(value);
  return sha ? sha.slice(0, len) : null;
}

function releaseSemver(releaseTag: string | null | undefined): string | null {
  const trimmed = (releaseTag ?? "").trim();
  if (!trimmed || !SEMVER.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/^v/i, "");
}

function splitVersionAndSha(
  version: string,
  commitSha: string | null | undefined,
): { version: string; sha: string | null } {
  const explicit = normalizeSha(commitSha);
  const raw = version.trim();
  if (SHA.test(raw)) {
    return { version: "0.0.0-dev", sha: explicit ?? raw.toLowerCase() };
  }
  const embedded = embeddedSha(raw);
  if (embedded) {
    return { version: embedded.version, sha: explicit ?? embedded.sha };
  }
  return { version: raw || "unknown", sha: explicit };
}

function embeddedSha(version: string): { version: string; sha: string } | null {
  const raw = version.trim();
  const plus = /^([^+]+)\+([0-9a-f]{7,64})$/i.exec(raw);
  if (plus && SEMVER.test(plus[1])) {
    return { version: plus[1], sha: plus[2].toLowerCase() };
  }
  const dash = /^(.*)-([0-9a-f]{7,64})$/i.exec(raw);
  if (dash && SEMVER.test(dash[1])) {
    return { version: dash[1], sha: dash[2].toLowerCase() };
  }
  return null;
}

function normalizeSha(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed || !SHA.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function displayVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed || trimmed === "unknown" || /^dev$/i.test(trimmed)) {
    return trimmed || "dev";
  }
  return `v${trimmed.replace(/^v/i, "")}`;
}
