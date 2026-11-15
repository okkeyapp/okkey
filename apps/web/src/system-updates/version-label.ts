const SHA = /^[0-9a-f]{7,64}$/i;
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export type SidebarVersionLabel = {
  /** Visible sidebar text, for example `v1.0.0-beta.3` — never a short SHA. */
  label: string;
  /** Full commit SHA for the hover tooltip on a dev build. */
  tooltip: string | null;
};

/**
 * Sidebar button text is the version only (no short SHA).
 * A tagged build and a plain version string both show `v<semver>`.
 * A version that is only a commit SHA uses the dev-channel version `0.0.0-dev`.
 * The tooltip is the full SHA when known.
 */
export function formatSidebarVersionLabel(input: {
  version: string;
  commitSha?: string | null;
  releaseTag?: string | null;
}): SidebarVersionLabel {
  const release = releaseSemver(input.releaseTag);
  if (release) {
    return { label: displayVersion(release), tooltip: null };
  }

  const parsed = splitVersionAndSha(input.version, input.commitSha);
  return {
    label: displayVersion(parsed.version),
    tooltip: parsed.sha,
  };
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
