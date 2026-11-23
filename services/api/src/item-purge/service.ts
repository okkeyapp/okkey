import type { EventsRepository } from "../storage/repositories.ts";
import type { VaultItemSoftDeletesRepository } from "../storage/vault-item-soft-deletes.ts";
import type { AttachmentService } from "../attachments/service.ts";

export class ItemPurgeService {
  private readonly events: Pick<
    EventsRepository,
    "deleteByVaultAndReferencedItemId" | "deleteByVaultAndReferencedItemIdExcept"
  >;
  private readonly softDeletes: VaultItemSoftDeletesRepository;
  private readonly attachments?: Pick<AttachmentService, "purgeForItem">;

  constructor(deps: {
    events: Pick<
      EventsRepository,
      "deleteByVaultAndReferencedItemId" | "deleteByVaultAndReferencedItemIdExcept"
    >;
    softDeletes: VaultItemSoftDeletesRepository;
    attachments?: Pick<AttachmentService, "purgeForItem">;
  }) {
    this.events = deps.events;
    this.softDeletes = deps.softDeletes;
    this.attachments = deps.attachments;
  }

  /**
   * Hard-delete a soft-deleted vault item: event history, soft-delete index, attachments.
   * When `keepEventId` is set (ITEM_PURGE tombstone), that event row is retained for sync.
   */
  async purgeItem(
    vaultId: string,
    itemId: string,
    options?: { keepEventId?: string },
  ): Promise<void> {
    if (options?.keepEventId) {
      await this.events.deleteByVaultAndReferencedItemIdExcept(
        vaultId,
        itemId,
        options.keepEventId,
      );
    } else {
      await this.events.deleteByVaultAndReferencedItemId(vaultId, itemId);
    }
    await this.softDeletes.remove(vaultId, itemId);
    await this.attachments?.purgeForItem(vaultId, itemId);
  }

  async purgeExpiredSoftDeletes(nowMs = Date.now()): Promise<number> {
    const expired = await this.softDeletes.listExpired(nowMs);
    let purged = 0;
    for (const row of expired) {
      await this.purgeItem(row.vaultId, row.itemId);
      purged += 1;
    }
    return purged;
  }
}
