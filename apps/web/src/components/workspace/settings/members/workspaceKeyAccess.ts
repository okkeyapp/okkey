import type { ApiClient, CoreApiClient } from "@okkey/api";
import type { WorkspacePermissionsMatrixDto } from "@okkey/types";

/** Bound workspace-key calls. `get` and `post` are the client's `api.get` and `api.post`. */
export type BoundWorkspaceKeyCore = {
  getWorkspaceKey: CoreApiClient["getWorkspaceKey"];
  grantWorkspaceKeyWrap: CoreApiClient["grantWorkspaceKeyWrap"];
  listWorkspaceMembers: CoreApiClient["listWorkspaceMembers"];
  deleteWorkspaceMember: CoreApiClient["deleteWorkspaceMember"];
  get: ApiClient["get"];
  post: ApiClient["post"];
};

export function bindWorkspaceKeyCore(core: CoreApiClient): BoundWorkspaceKeyCore {
  const api = core.getHttpClient();
  return {
    getWorkspaceKey: core.getWorkspaceKey.bind(core),
    grantWorkspaceKeyWrap: core.grantWorkspaceKeyWrap.bind(core),
    listWorkspaceMembers: core.listWorkspaceMembers.bind(core),
    deleteWorkspaceMember: core.deleteWorkspaceMember.bind(core),
    get: api.get.bind(api),
    post: api.post.bind(api),
  };
}

/** Ed25519 public key length. */
const ED25519_PUBLIC_KEY_LEN = 32;
/** ML-KEM-768 encapsulation key length (FIPS 203). */
const MLKEM768_ENCAPSULATION_KEY_LEN = 1184;

/** Call a client method with `this` set to the client. Unbound methods see `this.api` as undefined. */
export function bindClientMethod<This extends object, Args extends unknown[], Result>(
  client: This,
  method: (this: This, ...args: Args) => Result,
): (...args: Args) => Result {
  return method.bind(client);
}

export function canCompletePendingWorkspaceKey(
  permissions: WorkspacePermissionsMatrixDto | null | undefined,
): boolean {
  return (permissions?.members?.get ?? 0) >= 1;
}

export function recipientPublicKeysAreValid(
  publicKey: string | null | undefined,
  publicPqKey: string | null | undefined,
  base64ToBytes: (value: string) => Uint8Array,
): boolean {
  if (typeof publicKey !== "string" || typeof publicPqKey !== "string") {
    return false;
  }
  try {
    const ed = base64ToBytes(publicKey.trim());
    const pq = base64ToBytes(publicPqKey.trim());
    return ed.length === ED25519_PUBLIC_KEY_LEN && pq.length === MLKEM768_ENCAPSULATION_KEY_LEN;
  } catch {
    return false;
  }
}

export function apiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function workspaceKeyErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const body = (error as { body?: { error?: unknown } }).body;
  return typeof body?.error === "string" ? body.error : undefined;
}

/** Missing route, no access, no key yet, or the member already has the current wrap. */
export function isSwallowableWorkspaceKeyError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== "ApiRequestError") {
    return false;
  }
  const status = apiErrorStatus(error);
  if (status === 403 || status === 404 || status === 409) {
    return true;
  }
  const code = workspaceKeyErrorCode(error);
  return code === "WORKSPACE_KEY_MISSING" || code === "WORKSPACE_KEY_WRAP_EXISTS";
}
