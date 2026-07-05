import { generateEntityId } from "../entity-id.ts";
import { fetchRemoteFaviconBytesFromUrls, hostsFromUrls } from "./fetch-remote.ts";
import type { ItemFaviconStorage } from "../storage/item-favicon-storage.ts";
import type { VaultItemFaviconsRepository } from "../storage/vault-item-favicons.ts";
import type { VaultsRepository } from "../storage/repositories.ts";

export class ItemFaviconServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ItemFaviconServiceDeps {
  storage: ItemFaviconStorage;
  favicons: VaultItemFaviconsRepository;
  vaults: Pick<VaultsRepository, "canReadVault">;
}

export class ItemFaviconService {
  private readonly storage: ItemFaviconStorage;
  private readonly favicons: VaultItemFaviconsRepository;
  private readonly vaults: Pick<VaultsRepository, "canReadVault">;

  constructor(deps: ItemFaviconServiceDeps) {
    this.storage = deps.storage;
    this.favicons = deps.favicons;
    this.vaults = deps.vaults;
  }

  async getBytes(faviconId: string): Promise<Uint8Array | null> {
    return this.storage.get(faviconId);
  }

  /** Fetch favicon bytes for form preview; does not write to object storage. */
  async previewFromUrls(urls: readonly string[]): Promise<Uint8Array | null> {
    return fetchRemoteFaviconBytesFromUrls(urls);
  }

  /** Remove stored favicon when item is permanently purged (no user session). */
  async purgeForItem(vaultId: string, itemId: string): Promise<void> {
    const removedId = await this.favicons.deleteByVaultAndItem(vaultId, itemId);
    if (removedId) {
      await this.storage.delete(removedId).catch(() => undefined);
    }
  }

  async clear(vaultId: string, itemId: string, userId: string): Promise<void> {
    await this.assertVaultAccess(vaultId, userId);
    const removedId = await this.favicons.deleteByVaultAndItem(vaultId, itemId);
    if (removedId) {
      await this.storage.delete(removedId).catch(() => undefined);
    }
  }

  async upsertFromUrls(
    vaultId: string,
    itemId: string,
    userId: string,
    urls: readonly string[],
  ): Promise<{ faviconId: string | null }> {
    await this.assertVaultAccess(vaultId, userId);

    if (hostsFromUrls(urls).length === 0) {
      await this.clear(vaultId, itemId, userId);
      return { faviconId: null };
    }

    const remoteBytes = await fetchRemoteFaviconBytesFromUrls(urls);
    if (!remoteBytes) {
      await this.clear(vaultId, itemId, userId);
      return { faviconId: null };
    }

    return this.upsertFromPngBytes(vaultId, itemId, userId, remoteBytes);
  }

  async upsertFromPngBytes(
    vaultId: string,
    itemId: string,
    userId: string,
    pngBytes: Uint8Array,
  ): Promise<{ faviconId: string | null }> {
    await this.assertVaultAccess(vaultId, userId);

    if (pngBytes.byteLength === 0) {
      await this.clear(vaultId, itemId, userId);
      return { faviconId: null };
    }

    const faviconId = generateEntityId();
    const previous = await this.favicons.findByVaultAndItem(vaultId, itemId);

    await this.storage.put(faviconId, pngBytes);
    try {
      await this.favicons.upsert({ id: faviconId, vaultId, itemId });
    } catch (error) {
      await this.storage.delete(faviconId).catch(() => undefined);
      throw error;
    }

    if (previous && previous.id !== faviconId) {
      await this.storage.delete(previous.id).catch(() => undefined);
    }

    return { faviconId };
  }

  private async assertVaultAccess(vaultId: string, userId: string): Promise<void> {
    const allowed = await this.vaults.canReadVault(vaultId, userId);
    if (!allowed) {
      throw new ItemFaviconServiceError("FORBIDDEN", 403, "Vault access denied");
    }
  }
}
