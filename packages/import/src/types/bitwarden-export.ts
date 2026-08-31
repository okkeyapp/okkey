import { CipherView, FolderView, CollectionView } from "./views/index.js";

export type BitwardenExportItem = Record<string, unknown> & {
  id?: string;
  folderId?: string | null;
  collectionIds?: string[] | null;
  type?: number;
  name?: string;
};

export type BitwardenUnEncryptedIndividualJsonExport = {
  encrypted?: false;
  folders?: Array<{ id: string; name: string }>;
  items: BitwardenExportItem[];
};

export type BitwardenUnEncryptedOrgJsonExport = {
  encrypted?: false;
  collections?: Array<{ id: string; name: string }>;
  items: BitwardenExportItem[];
};

export type BitwardenUnEncryptedJsonExport =
  | BitwardenUnEncryptedIndividualJsonExport
  | BitwardenUnEncryptedOrgJsonExport;

export type BitwardenJsonExport = BitwardenUnEncryptedJsonExport | { encrypted: true; [key: string]: unknown };

export function isUnencrypted(results: BitwardenJsonExport): results is BitwardenUnEncryptedJsonExport {
  return !("encrypted" in results && results.encrypted === true);
}

export function isOrgUnEncrypted(
  results: BitwardenUnEncryptedJsonExport,
): results is BitwardenUnEncryptedOrgJsonExport {
  return Array.isArray((results as BitwardenUnEncryptedOrgJsonExport).collections);
}

export const CipherWithIdExport = {
  toView(item: BitwardenExportItem): CipherView {
    return CipherView.fromJSON(item) ?? new CipherView();
  },
};

export const FolderWithIdExport = {
  toView(folder: { id: string; name: string }): FolderView {
    const view = new FolderView();
    view.id = folder.id;
    view.name = folder.name;
    return view;
  },
};

export const CollectionWithIdExport = {
  toView(collection: { id: string; name: string }): CollectionView {
    return new CollectionView({ id: collection.id, name: collection.name, organizationId: null });
  },
};
