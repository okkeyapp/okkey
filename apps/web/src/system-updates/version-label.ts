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
};

/**
 * Sidebar button text is the version, plus a short okkey commit SHA in parentheses
 * when known (first 8 chars of API `commitSha` / `OKKEY_GIT_SHA`).
 * A tagged build and a plain version string both show `v<semver>`.
 * A version that is only a commit SHA uses the dev-channel version `0.0.0-dev`.
 * When the SHA is empty or invalid, the label is the version only (no empty parentheses).
 */
export function formatSidebarVersionLabel(input: {
  version: string;
  commitSha?: string | null;
  releaseTag?: string | null;
}): SidebarVersionLabel {
  const release = releaseSemver(input.releaseTag);
  const parsed = release
    ? { version: release, sha: normalizeSha(input.commitSha) }
    : splitVersionAndSha(input.version, input.commitSha);

  return {
    label: withShortSha(displayVersion(parsed.version), parsed.sha),
    tooltip: parsed.sha,
  };
}

function withShortSha(versionDisplay: string, sha: string | null): string {
  if (!sha) {
    return versionDisplay;
  }
  return `${versionDisplay} (${sha.slice(0, SHORT_SHA_LEN)})`;
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
