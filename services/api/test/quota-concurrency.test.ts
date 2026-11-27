/**
 * Concurrent quota gates for shared vaults and invitation seats.
 *
 * Both are test.todo: production has a real TOCTOU race (do not fix in this PR).
 *
 * createSharedVault: assertSharedVaultQuota (~230) runs before the insert
 * transaction (~286) with no lock/re-check. Evidence: stateful mock that returns
 * sharedCount=0 to concurrent quota readers then increments on INSERT; Promise.all
 * of two createSharedVault calls with FREE maxSharedVaults=1 yielded
 * fulfilled.length === 2 (both succeeded past the cap).
 *
 * createInvitations: assertAdditionalMembersQuota (~362) runs once before batch
 * inserts with no seat lock across callers. Evidence: FREE occupiedSeats=2 (one
 * seat left); Promise.all of two single-invite batches both passed used+1 <= 3
 * and both inserted (fulfilled.length === 2, occupied seats ended at 4).
 *
 * Re-enable as test() with the harness below once quota checks are serialized
 * with the writes (e.g. lock / re-check inside the transaction).
 */
import { test } from "node:test";

test.todo(
  "parallel createSharedVault at maxSharedVaults=1 yields one success and one PLAN_QUOTA_EXCEEDED",
);

test.todo(
  "parallel invitation batches at the FREE seat limit yield one success and one PLAN_QUOTA_EXCEEDED",
);
