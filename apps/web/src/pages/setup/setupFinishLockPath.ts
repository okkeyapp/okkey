import {
  accountLockWithRedirectQuery,
  ITEMS_PATH,
  WORKSPACE_QUERY_PARAM,
} from "../../routes/paths";

/**
 * After first-run setup finish: Bearer session is applied but the vault stays locked.
 * Send the owner to the existing unlock screen; after master-password unlock, open items.
 */
export function setupFinishLockPath(workspaceId: string): string {
  const itemsHref = `${ITEMS_PATH}?${WORKSPACE_QUERY_PARAM}=${encodeURIComponent(workspaceId)}`;
  return accountLockWithRedirectQuery(encodeURIComponent(itemsHref));
}
