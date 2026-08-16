import type { Vault } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, buttonVariants, cn } from "@okkey/ui";
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useItemsMobileListView } from "../../hooks/useItemsMobileListView";
import { itemsPathWithFolderMerged, itemsPathWithVaultMerged } from "../../routes/paths";
import { vaultDisplayIcon } from "../workspace/settings/vaults/vaultIcons";
import ItemFolderAssignControl from "./ItemFolderAssignControl";

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

const breadcrumbGhostButtonClassName = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-6 min-h-6 max-h-6 min-w-0 max-w-full gap-1.5 px-1 text-sm font-normal text-foreground hover:text-foreground",
);

const breadcrumbStaticClassName = "inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 px-1 text-sm text-foreground";

const breadcrumbIconOnlyButtonClassName = cn(breadcrumbGhostButtonClassName, "shrink-0 !max-w-none !gap-0");

type BreadcrumbCompressMode = "full" | "hide-folder-label" | "hide-vault-label";

type BreadcrumbTrailProps = {
  vault: Vault | undefined;
  vaultTo: string | null;
  folderId: string | null;
  folderTo: string | null;
  folderLabel: string;
  showVaultLabel: boolean;
  showFolderLabel: boolean;
  folderAssign?: ReactNode;
};

function BreadcrumbTrail({
  vault,
  vaultTo,
  folderId,
  folderTo,
  folderLabel,
  showVaultLabel,
  showFolderLabel,
  folderAssign,
}: BreadcrumbTrailProps) {
  const vaultName = vault?.name ?? "…";
  const vaultEmoji = vault ? vaultDisplayIcon(vault) : "💼";
  const vaultButtonClassName = showVaultLabel ? breadcrumbGhostButtonClassName : breadcrumbIconOnlyButtonClassName;
  const folderButtonClassName = showFolderLabel ? breadcrumbGhostButtonClassName : breadcrumbIconOnlyButtonClassName;
  const folderIsLink = Boolean(folderId && folderTo);

  return (
    <>
      {vaultTo ? (
        <Button asChild variant="ghost" className={vaultButtonClassName}>
          <Link to={vaultTo} title={vaultName} aria-label={vaultName}>
            <span className="text-base leading-none" aria-hidden>
              {vaultEmoji}
            </span>
            {showVaultLabel ? <span className="truncate">{vaultName}</span> : null}
          </Link>
        </Button>
      ) : (
        <span className={breadcrumbStaticClassName} title={vaultName}>
          <span className="text-base leading-none" aria-hidden>
            {vaultEmoji}
          </span>
          {showVaultLabel ? <span className="truncate">{vaultName}</span> : null}
        </span>
      )}

      <span className="shrink-0 text-muted-foreground" aria-hidden>
        •
      </span>
      {folderIsLink ? (
        <Button asChild variant="ghost" className={folderButtonClassName}>
          <Link to={folderTo!} title={folderLabel} aria-label={folderLabel}>
            <FolderClosedIcon />
            {showFolderLabel ? <span className="truncate">{folderLabel}</span> : null}
          </Link>
        </Button>
      ) : (
        <span className={breadcrumbStaticClassName} title={folderLabel}>
          <FolderClosedIcon />
          {showFolderLabel ? <span className="truncate">{folderLabel}</span> : null}
        </span>
      )}
      {folderAssign}
    </>
  );
}

function useBreadcrumbCompressMode(input: {
  breadcrumbsRef: RefObject<HTMLDivElement | null>;
  measureFullRef: RefObject<HTMLDivElement | null>;
  measureFolderIconRef: RefObject<HTMLDivElement | null>;
  measureVaultIconRef: RefObject<HTMLDivElement | null>;
  rebindKey: string;
}): BreadcrumbCompressMode {
  const [compressMode, setCompressMode] = useState<BreadcrumbCompressMode>("full");

  useLayoutEffect(() => {
    const update = () => {
      const breadcrumbs = input.breadcrumbsRef.current;
      const full = input.measureFullRef.current;
      const folderIcon = input.measureFolderIconRef.current;
      const vaultIcon = input.measureVaultIconRef.current;
      if (!breadcrumbs || !full || !folderIcon || !vaultIcon) {
        return;
      }

      const available = breadcrumbs.clientWidth;
      const fullWidth = full.offsetWidth;
      const folderIconWidth = folderIcon.offsetWidth;

      if (fullWidth <= available) {
        setCompressMode("full");
        return;
      }

      if (folderIconWidth <= available) {
        setCompressMode("hide-folder-label");
        return;
      }

      setCompressMode("hide-vault-label");
    };

    const observer = new ResizeObserver(update);
    const observedElements = [
      input.breadcrumbsRef.current,
      input.measureFullRef.current,
      input.measureFolderIconRef.current,
      input.measureVaultIconRef.current,
    ];
    for (const element of observedElements) {
      if (element) {
        observer.observe(element);
      }
    }
    update();
    return () => observer.disconnect();
  }, [
    input.breadcrumbsRef,
    input.measureFullRef,
    input.measureFolderIconRef,
    input.measureVaultIconRef,
    input.rebindKey,
  ]);

  return compressMode;
}

type ItemDetailBreadcrumbsProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  vault: Vault | undefined;
  itemId: string;
  folderId: string | null;
  folderLabel: string;
  canChangeFolder?: boolean;
  className?: string;
};

export default function ItemDetailBreadcrumbs({
  t,
  vault,
  itemId,
  folderId,
  folderLabel,
  canChangeFolder = true,
  className,
}: ItemDetailBreadcrumbsProps) {
  const [searchParams] = useSearchParams();
  const isItemsMobileListView = useItemsMobileListView();
  const itemsPathMergeOptions = isItemsMobileListView ? { clearItem: true as const } : undefined;
  const vaultTo = vault ? itemsPathWithVaultMerged(searchParams, vault.id, itemsPathMergeOptions) : null;
  const folderTo = folderId ? itemsPathWithFolderMerged(searchParams, folderId, itemsPathMergeOptions) : null;

  const breadcrumbsRef = useRef<HTMLDivElement>(null);
  const measureFullRef = useRef<HTMLDivElement>(null);
  const measureFolderIconRef = useRef<HTMLDivElement>(null);
  const measureVaultIconRef = useRef<HTMLDivElement>(null);

  const folderAssign = canChangeFolder ? (
    <ItemFolderAssignControl t={t} itemId={itemId} folderId={folderId} />
  ) : null;

  const compressMode = useBreadcrumbCompressMode({
    breadcrumbsRef,
    measureFullRef,
    measureFolderIconRef,
    measureVaultIconRef,
    rebindKey: `${vault?.id ?? ""}:${folderId ?? ""}:${folderLabel}:${vault?.name ?? ""}:${canChangeFolder ? "1" : "0"}`,
  });

  const breadcrumbBaseProps = {
    vault,
    vaultTo,
    folderId,
    folderTo,
    folderLabel,
    folderAssign,
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <div className="pointer-events-none invisible absolute left-0 top-0 -z-10 flex flex-col" aria-hidden>
        <div ref={measureFullRef} className="flex w-max items-center gap-2 text-sm">
          <BreadcrumbTrail {...breadcrumbBaseProps} showVaultLabel showFolderLabel />
        </div>
        <div ref={measureFolderIconRef} className="flex w-max items-center gap-2 text-sm">
          <BreadcrumbTrail {...breadcrumbBaseProps} showVaultLabel showFolderLabel={false} />
        </div>
        <div ref={measureVaultIconRef} className="flex w-max items-center gap-2 text-sm">
          <BreadcrumbTrail {...breadcrumbBaseProps} showVaultLabel={false} showFolderLabel={false} />
        </div>
      </div>

      <div ref={breadcrumbsRef} className="flex w-full min-w-0 flex-1 items-center gap-2 overflow-visible text-sm">
        <BreadcrumbTrail
          {...breadcrumbBaseProps}
          showVaultLabel={compressMode !== "hide-vault-label"}
          showFolderLabel={compressMode === "full"}
        />
      </div>
    </div>
  );
}
