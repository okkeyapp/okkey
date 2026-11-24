import type { QueryExecutor } from "../storage/postgres.ts";

/**
 * Seats occupied against `maxAdditionalMembers`.
 *
 * The owner is not a seat. A seat is an active member other than the workspace
 * owner, or a live invitation: status `pending`, not expired, not revoked.
 * Accepted invitations are members; revoked and expired ones do not count.
 * Every quota check (invite create, invite accept) must use this function.
 */
export async function countOccupiedAdditionalMemberSeats(
  db: QueryExecutor,
  workspaceId: string,
  now: Date = new Date(),
): Promise<number> {
  const memberRows = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM workspace_members wm
      WHERE wm.workspace_id = $1
        AND wm.user_id <> (
          SELECT w.owner_id FROM workspaces w WHERE w.id = wm.workspace_id
        )
    `,
    [workspaceId],
  );
  const pendingRows = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM workspace_invitations
      WHERE workspace_id = $1
        AND status = 'pending'
        AND expires_at > $2::timestamptz
    `,
    [workspaceId, now.toISOString()],
  );
  const members = Number(memberRows[0]?.count ?? 0);
  const pending = Number(pendingRows[0]?.count ?? 0);
  if (!Number.isFinite(members) || !Number.isFinite(pending)) {
    return Number.POSITIVE_INFINITY;
  }
  return members + pending;
}
