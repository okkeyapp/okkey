import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  cn,
} from "@okkey/ui";
import {
  NO_FOLDER_VALUE,
  flattenWorkspaceFolders,
  folderPathExists,
  type FlatWorkspaceFolder,
  type WorkspaceFolderNode,
} from "@okkey/vault";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function FolderClosedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M1.5 6.5H14.5M13.1667 13.5C13.5203 13.5 13.8594 13.3595 14.1095 13.1095C14.3594 12.8594 14.5 12.5203 14.5 12.1667V5.83333C14.5 5.47971 14.3595 5.14057 14.1095 4.89052C13.8594 4.64048 13.5203 4.5 13.1667 4.5H8.06671C7.84372 4.50219 7.62374 4.44841 7.42691 4.34359C7.23008 4.23877 7.06268 4.08625 6.94004 3.9L6.40004 3.1C6.27863 2.91565 6.11336 2.76432 5.91904 2.6596C5.72472 2.55488 5.50745 2.50004 5.28671 2.5H2.83333C2.47971 2.5 2.14057 2.64048 1.89052 2.89052C1.64048 3.14057 1.5 3.47971 1.5 3.83333V12.1667C1.5 12.5203 1.64048 12.8594 1.89052 13.1095C2.14057 13.3595 2.47971 13.5 2.83333 13.5H13.1667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDown12Icon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type ExtensionItemFolderAssignControlProps = {
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
  folderId: string | null;
  folderNodes: readonly WorkspaceFolderNode[];
  disabled?: boolean;
  className?: string;
  onAssign: (folderId: string | null) => Promise<void>;
  onCreateFolder: (label: string) => Promise<string>;
};

/**
 * Folder-assign control for extension item detail — same UX as web mobile
 * `ItemFolderAssignControl` (chevron + searchable popover).
 */
export function ExtensionItemFolderAssignControl({
  t,
  folderId,
  folderNodes,
  disabled = false,
  className,
  onAssign,
  onCreateFolder,
}: ExtensionItemFolderAssignControlProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const flatFolders = useMemo(() => flattenWorkspaceFolders(folderNodes), [folderNodes]);
  const currentValue = folderId ?? NO_FOLDER_VALUE;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredFolders = useMemo((): FlatWorkspaceFolder[] => {
    if (!normalizedQuery) {
      return flatFolders;
    }
    return flatFolders.filter((folder) => folder.path.toLowerCase().includes(normalizedQuery));
  }, [flatFolders, normalizedQuery]);

  const noFolderLabel = t("web.newItemPopup.noFolder");
  const showNoFolder =
    !normalizedQuery || noFolderLabel.toLowerCase().includes(normalizedQuery);
  const showCreate = query.trim().length > 0 && !folderPathExists(flatFolders, query.trim());

  async function selectFolder(nextFolderId: string | null) {
    if (saving) {
      return;
    }
    const nextValue = nextFolderId ?? NO_FOLDER_VALUE;
    if (nextValue === currentValue) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const toastId = toast.loading(t("web.toast.save.loading"));
    try {
      await onAssign(nextFolderId);
      toast.success(t("web.toast.save.success"), { id: toastId });
      setOpen(false);
      setQuery("");
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message.trim() ? err.message : t("web.toast.save.error"), {
        id: toastId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled || saving) {
          return;
        }
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="iconSm"
          disabled={disabled || saving}
          className={cn(
            "!size-6 !min-h-6 !min-w-6 shrink-0 rounded-md border-border",
            className,
          )}
          aria-label={t("web.items.detail.changeFolderAria")}
        >
          <ChevronDown12Icon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[16rem] p-0" sideOffset={4}>
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("web.newItemPopup.folderSearch")}
            className="h-8"
            autoFocus
          />
        </div>
        <ScrollArea className="max-h-60">
          <div className="flex flex-col gap-0.5 p-1" role="listbox">
            {showNoFolder ? (
              <FolderOptionRow
                label={noFolderLabel}
                selected={currentValue === NO_FOLDER_VALUE}
                onSelect={() => void selectFolder(null)}
              />
            ) : null}
            {filteredFolders.map((folder) => (
              <FolderOptionRow
                key={folder.id}
                label={folder.path}
                selected={currentValue === folder.id}
                onSelect={() => void selectFolder(folder.id)}
              />
            ))}
            {showCreate ? (
              <button
                type="button"
                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-2 text-left text-sm text-foreground outline-none hover:bg-secondary"
                onClick={() => {
                  void (async () => {
                    setSaving(true);
                    const toastId = toast.loading(t("web.toast.save.loading"));
                    try {
                      const createdId = await onCreateFolder(query.trim());
                      await onAssign(createdId);
                      toast.success(t("web.toast.save.success"), { id: toastId });
                      setOpen(false);
                      setQuery("");
                    } catch (err: unknown) {
                      toast.error(
                        err instanceof Error && err.message.trim()
                          ? err.message
                          : t("web.toast.save.error"),
                        { id: toastId },
                      );
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
              >
                {t("web.newItemPopup.createFolder", { name: query.trim() })}
              </button>
            ) : null}
            {!showNoFolder && filteredFolders.length === 0 && !showCreate ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                {t("web.newItemPopup.folderSearchEmpty")}
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function FolderOptionRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-secondary hover:text-foreground",
        selected && "bg-secondary",
      )}
      onClick={onSelect}
    >
      <FolderClosedIcon className="text-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
