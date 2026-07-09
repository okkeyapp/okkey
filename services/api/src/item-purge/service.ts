import type { EventsRepository } from "../storage/repositories.ts";
import type { VaultItemSoftDeletesRepository } from "../storage/vault-item-soft-deletes.ts";
import type { AttachmentService } from "../attachments/service.ts";

export class ItemPurgeService {
  private readonly events: Pick<EventsRepository, "deleteByVaultAndReferencedItemId">;
  private readonly softDeletes: VaultItemSoftDeletesRepository;
  private readonly attachments?: Pick<AttachmentService, "purgeForItem">;

  constructor(deps: {
    events: Pick<EventsRepository, "deleteByVaultAndReferencedItemId">;
    softDeletes: VaultItemSoftDeletesRepository;
    attachments?: Pick<AttachmentService, "purgeForItem">;
  }) {
    this.events = deps.events;
    this.softDeletes = deps.softDeletes;
    this.attachments = deps.attachments;
  }

  async purgeExpiredSoftDeletes(nowMs = Date.now()): Promise<number> {
    const expired = await this.softDeletes.listExpired(nowMs);
    let purged = 0;
    for (const row of expired) {
      await this.events.deleteByVaultAndReferencedItemId(row.vaultId, row.itemId);
      await this.softDeletes.remove(row.vaultId, row.itemId);
      await this.attachments?.purgeForItem(row.vaultId, row.itemId);
      purged += 1;
    }
    return purged;
  }
}
