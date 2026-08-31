export class FolderView {
  id?: string | null;
  name = "";
}

export class CollectionView {
  id?: string | null;
  name = "";
  organizationId?: string | null;

  constructor(init?: Partial<CollectionView>) {
    if (init) {
      Object.assign(this, init);
    }
  }
}
