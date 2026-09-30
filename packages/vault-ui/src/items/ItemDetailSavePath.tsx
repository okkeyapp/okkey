import type { Vault } from "@okkey/types";
import { cn, vaultDisplayIcon } from "@okkey/ui";
import type { ReactNode } from "react";

function FolderClosedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M1.5 6.5H14.5M13.1667 13.5C13.5203 13.5 13.8594 13.3595 14.1095 13.1095C14.3595 12.8594 14.5 12.5203 14.5 12.1667V5.83333C14.5 5.47971 14.3595 5.14057 14.1095 4.89052C13.8594 4.64048 13.5203 4.5 13.1667 4.5H8.06671C7.84372 4.50219 7.62374 4.44841 7.42691 4.34359C7.23008 4.23877 7.06268 4.08625 6.94004 3.9L6.40004 3.1C6.27863 2.91565 6.11336 2.76432 5.91904 2.6596C5.72472 2.55488 5.50745 2.50004 5.28671 2.5H2.83333C2.47971 2.5 2.14057 2.64048 1.89052 2.89052C1.64048 3.14057 1.5 3.47971 1.5 3.83333V12.1667C1.5 12.5203 1.64048 12.8594 1.89052 13.1095C2.14057 13.3595 2.47971 13.5 2.83333 13.5H13.1667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const breadcrumbStaticClassName =
  "inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 px-1 text-sm text-foreground";

export type ItemDetailSavePathProps = {
  vault: Vault | undefined;
  folderLabel: string;
  /** Optional trailing control (e.g. web folder-assign). */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Read-only save-location trail under the item form: vault • folder
 * (same visual as web `ItemDetailBreadcrumbs` without router/assign).
 */
export default function ItemDetailSavePath({
  vault,
  folderLabel,
  trailing,
  className,
}: ItemDetailSavePathProps) {
  const vaultName = vault?.name ?? "…";
  const vaultEmoji = vault ? vaultDisplayIcon(vault) : "💼";

  return (
    <div className={cn("flex w-full min-w-0 flex-1 items-center gap-2 overflow-visible pt-4 text-sm", className)}>
      <span className={breadcrumbStaticClassName} title={vaultName}>
        <span className="text-base leading-none" aria-hidden>
          {vaultEmoji}
        </span>
        <span className="truncate">{vaultName}</span>
      </span>
      <span className="shrink-0 text-muted-foreground" aria-hidden>
        •
      </span>
      <span className={breadcrumbStaticClassName} title={folderLabel}>
        <FolderClosedIcon />
        <span className="truncate">{folderLabel}</span>
      </span>
      {trailing}
    </div>
  );
}
