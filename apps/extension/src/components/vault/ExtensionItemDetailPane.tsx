import type { ItemPlaintextV2, Vault } from "@okkey/types";
import {
  Favicon,
  ItemDetailActionsBar,
  KeyField,
  KeyForm,
  ScrollArea,
} from "@okkey/ui";
import { extractReadableItemFields } from "@okkey/vault";

type ExtensionItemDetailPaneProps = {
  item: ItemPlaintextV2;
  vault?: Vault;
  emptyLabel: string;
  onCopy: (value: string, label: string) => void;
  onEdit: () => void;
  onCreateCapsule: () => void;
  onFavoriteInWeb: () => void;
  onArchiveInWeb: () => void;
  onDeleteInWeb: () => void;
  onOpenInWeb: () => void;
  t: (key: string) => string;
};

/**
 * Extension detail pane — same composition as web ItemDetailCard:
 * ItemDetailActionsBar (no back) + favicon/title + KeyForm view fields.
 * Mutations deep-link to web.
 */
export function ExtensionItemDetailPane(props: ExtensionItemDetailPaneProps) {
  const {
    item,
    onCopy,
    onEdit,
    onCreateCapsule,
    onFavoriteInWeb,
    onArchiveInWeb,
    onDeleteInWeb,
    onOpenInWeb,
    t,
  } = props;
  const fields = extractReadableItemFields(item);
  const archived = item.archived ?? false;
  const deleted = item.deleted ?? false;
  const isLogin = item.categoryId === "login";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ItemDetailActionsBar
        t={t}
        favorite={false}
        archived={archived}
        deleted={deleted}
        showBack={false}
        onEdit={onEdit}
        onToggleFavorite={onFavoriteInWeb}
        onToggleArchive={onArchiveInWeb}
        onToggleDelete={onDeleteInWeb}
        onCreateCapsule={onCreateCapsule}
        canEdit={!archived && !deleted}
        canFavorite={!archived && !deleted}
        canArchive={!deleted}
        canDelete
        canCreateCapsule={!archived && !deleted}
        openInWebLabel={t("extension.vault.openInWeb")}
        onOpenInWeb={onOpenInWeb}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[600px] flex-1 px-4 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Favicon
                name={isLogin ? item.title : undefined}
                size={40}
                alt=""
              />
              <h1 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">
                {item.title || "—"}
              </h1>
            </div>

            <KeyForm mode="view">
              {fields.map((field) => (
                <KeyField
                  key={field.id}
                  mode="view"
                  label={field.label}
                  value={field.conceal ? undefined : field.value}
                  concealValue={field.conceal}
                  copyValue={field.copyable ? field.value : undefined}
                  copyLabel={t("extension.vault.copy")}
                  copySuccessLabel={t("extension.vault.copied")}
                  onCopyAction={
                    field.copyable
                      ? async (value) => {
                          onCopy(value, field.label);
                        }
                      : undefined
                  }
                />
              ))}
            </KeyForm>
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("extension.vault.noFields")}</p>
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function ExtensionItemDetailEmpty(props: {
  workspaceName?: string;
  selectLabel: string;
  workspaceFallback: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
      <p>{props.workspaceName ?? props.workspaceFallback}</p>
      <p>{props.selectLabel}</p>
    </div>
  );
}
