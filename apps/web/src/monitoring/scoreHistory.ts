export type ScoreSnapshot = {
  ts: number;
  score: number;
};

const STORAGE_PREFIX = "okkey.monitoring.scoreHistory.v1:";
const MAX_SNAPSHOTS = 120;

function storageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function mergeScoreSnapshot(
  prev: readonly ScoreSnapshot[],
  score: number,
  nowMs: number,
): ScoreSnapshot[] {
  const today = dayKey(nowMs);
  const withoutToday = prev.filter((s) => dayKey(s.ts) !== today);
  return [...withoutToday, { ts: nowMs, score }]
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_SNAPSHOTS);
}

export function loadScoreHistory(workspaceId: string): ScoreSnapshot[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (row): row is ScoreSnapshot =>
          Boolean(row) &&
          typeof row === "object" &&
          typeof (row as ScoreSnapshot).ts === "number" &&
          typeof (row as ScoreSnapshot).score === "number",
      )
      .sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

function saveScoreHistory(workspaceId: string, snapshots: readonly ScoreSnapshot[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(snapshots.slice(-MAX_SNAPSHOTS)));
  } catch {
    // quota / private mode
  }
}

/** Record at most one snapshot per calendar day (local timezone). */
export function recordScoreSnapshot(workspaceId: string, score: number, nowMs = Date.now()): ScoreSnapshot[] {
  const next = mergeScoreSnapshot(loadScoreHistory(workspaceId), score, nowMs);
  saveScoreHistory(workspaceId, next);
  return next;
}

export function scoreHistoryForDays(
  snapshots: readonly ScoreSnapshot[],
  days: number,
  nowMs = Date.now(),
): ScoreSnapshot[] {
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((s) => s.ts >= cutoff);
}
