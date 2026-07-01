import type { EventsRepository } from "../storage/repositories.ts";
import type { VaultItemSoftDeletesRepository } from "../storage/vault-item-soft-deletes.ts";
import type { ItemFaviconService } from "../favicon/service.ts";

export class ItemPurgeService {
  private readonly events: Pick<EventsRepository, "deleteByVaultAndReferencedItemId">;
  private readonly softDeletes: VaultItemSoftDeletesRepository;
  private readonly favicons?: Pick<ItemFaviconService, "purgeForItem">;

  constructor(deps: {
    events: Pick<EventsRepository, "deleteByVaultAndReferencedItemId">;
    softDeletes: VaultItemSoftDeletesRepository;
    favicons?: Pick<ItemFaviconService, "purgeForItem">;
  }) {
    this.events = deps.events;
    this.softDeletes = deps.softDeletes;
    this.favicons = deps.favicons;
  }

  async purgeExpiredSoftDeletes(nowMs = Date.now()): Promise<number> {
    const expired = await this.softDeletes.listExpired(nowMs);
    let purged = 0;
    for (const row of expired) {
      await this.events.deleteByVaultAndReferencedItemId(row.vaultId, row.itemId);
      await this.softDeletes.remove(row.vaultId, row.itemId);
      await this.favicons?.purgeForItem(row.vaultId, row.itemId);
      purged += 1;
    }
    return purged;
  }
}
