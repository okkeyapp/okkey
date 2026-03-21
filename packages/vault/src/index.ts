import type { Item, Vault } from "../../types/src/index.js";

export interface VaultStore {
  listVaults(): Promise<Vault[]>;
  listItems(vaultId: string): Promise<Item[]>;
  getItem(vaultId: string, itemId: string): Promise<Item | null>;
  saveItem(vaultId: string, item: Item): Promise<void>;
  deleteItem(vaultId: string, itemId: string): Promise<void>;
}
