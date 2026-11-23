/**
 * Pick which workspace the shell should open when arriving at /items.
 * Prefer an explicit candidate (query or stored) that the user still belongs to;
 * otherwise use a single membership, then any first membership so the shell
 * never spins forever with an empty selection.
 */
export function resolveCurrentWorkspaceId(input: {
  memberships: ReadonlyArray<{ id: string }>;
  preferredId?: string | null;
}): string | null {
  const preferred = input.preferredId?.trim() ?? "";
  if (preferred && input.memberships.some((workspace) => workspace.id === preferred)) {
    return preferred;
  }
  if (input.memberships.length === 1) {
    return input.memberships[0]!.id;
  }
  return input.memberships[0]?.id ?? null;
}
