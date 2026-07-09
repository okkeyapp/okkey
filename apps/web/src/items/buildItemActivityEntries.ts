import type { ItemPlaintextV2 } from "@okkey/types";

export type ItemActivityActionKey =
  | "created"
  | "updated"
  | "archived"
  | "unarchived"
  | "deleted"
  | "restored";

export type ItemActivityEntry = {
  id: string;
  actionKey: ItemActivityActionKey;
  atMs: number;
  actorLabel: string;
};

export type ItemActivityWireEntry = {
  id: string;
  actionKey: ItemActivityActionKey;
  atMs: number;
  actorId: string | null;
};

export function resolveItemUpdateActivityKey(
  previous: ItemPlaintextV2 | undefined,
  next: ItemPlaintextV2,
): ItemActivityActionKey {
  const wasDeleted = Boolean(previous?.deleted);
  const isDeleted = Boolean(next.deleted);
  if (!wasDeleted && isDeleted) {
    return "deleted";
  }
  if (wasDeleted && !isDeleted) {
    return "restored";
  }
  const wasArchived = Boolean(previous?.archived);
  const isArchived = Boolean(next.archived);
  if (!wasArchived && isArchived) {
    return "archived";
  }
  if (wasArchived && !isArchived) {
    return "unarchived";
  }
  return "updated";
}

export function mapItemActivityWireEntries(
  entries: readonly ItemActivityWireEntry[],
  resolveActorLabel: (actorId: string | null) => string,
): ItemActivityEntry[] {
  const seenIds = new Set<string>();
  return [...entries]
    .sort((a, b) => b.atMs - a.atMs)
    .filter((entry) => {
      if (seenIds.has(entry.id)) {
        return false;
      }
      seenIds.add(entry.id);
      return true;
    })
    .map((entry) => ({
      id: entry.id,
      actionKey: entry.actionKey,
      atMs: entry.atMs,
      actorLabel: resolveActorLabel(entry.actorId),
    }));
}

/** Fallback when vault event history is not available yet. */
export function buildItemActivityEntries(input: {
  itemId: string;
  createdAtMs: number;
  updatedAtMs: number;
  actorLabel: string;
}): ItemActivityEntry[] {
  const entries: ItemActivityEntry[] = [
    {
      id: `${input.itemId}-created`,
      actionKey: "created",
      atMs: input.createdAtMs,
      actorLabel: input.actorLabel,
    },
  ];

  if (input.updatedAtMs > input.createdAtMs) {
    entries.push({
      id: `${input.itemId}-updated`,
      actionKey: "updated",
      atMs: input.updatedAtMs,
      actorLabel: input.actorLabel,
    });
  }

  return entries.sort((a, b) => b.atMs - a.atMs);
}
