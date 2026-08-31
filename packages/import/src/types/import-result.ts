export type ImportRecordError = {
  type: string;
  message: string;
  row?: number;
};

export type FolderRelationship = [cipherIndex: number, folderIndex: number];
export type CollectionRelationship = [cipherIndex: number, collectionIndex: number];

export class ImportResult {
  success = false;
  errorMessage?: string;
  ciphers: import("./views/cipher.view.js").CipherView[] = [];
  folders: import("./views/folder.view.js").FolderView[] = [];
  folderRelationships: FolderRelationship[] = [];
  collections: import("./views/collection.view.js").CollectionView[] = [];
  collectionRelationships: CollectionRelationship[] = [];
  errors: ImportRecordError[] = [];
}

export type ParsedImportBundle = {
  /** Text payload passed to the selected importer (JSON/CSV/XML/TXT). */
  text: string;
  /** Raw attachment bytes keyed by importer-relative path (e.g. Bitwarden ZIP attachments). */
  attachmentFiles: Map<string, Uint8Array>;
};
