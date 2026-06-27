import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, type AnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup, cn } from "@okkey/ui";
import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  applyFolderTreeDrag,
  flattenFolderTree,
  getFolderDescendantCount,
  getFolderTreeProjection,
  removeFolderChildrenOf,
  type FlattenedFolderItem,
} from "../../folders/folderSortableTree";
import {
  buildCommittedLabelMap,
  cloneWorkspaceFolderTree,
  createDraftWorkspaceFolderAtRoot,
  removeWorkspaceFolderById,
  updateWorkspaceFolderLabel,
} from "../../folders/folderSettingsTree";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import type { WorkspaceFolderNode } from "../../folders/workspaceFolderTree";
import {
  FOLDERS_POPUP_ID,
  POPUP_QUERY_PARAM,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";

type FoldersSettingsPopupProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

const FOLDER_INDENT_PX = 24;
const FOLDER_ROW_HEIGHT_CLASS_NAME = "h-[56px]";
const ROW_SLOT_CLASS_NAME = cn(FOLDER_ROW_HEIGHT_CLASS_NAME, "shrink-0");

const folderTreeMeasuring = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

const animateFolderLayoutChanges: AnimateLayoutChanges = ({ isSorting, wasDragging }) =>
  !(isSorting || wasDragging);

function GripIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="9" cy="5" r="1.4" />
      <circle cx="15" cy="5" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="15" cy="19" r="1.4" />
    </svg>
  );
}

function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M9.99992 3.33333L12.6666 6M14.1159 4.54126C14.4683 4.18888 14.6664 3.71091 14.6665 3.2125C14.6665 2.71409 14.4686 2.23607 14.1162 1.8836C13.7638 1.53112 13.2859 1.33307 12.7874 1.33301C12.289 1.33295 11.811 1.53088 11.4585 1.88326L2.56121 10.7826C2.40642 10.9369 2.29195 11.127 2.22787 11.3359L1.34721 14.2373C1.32998 14.2949 1.32868 14.3562 1.34344 14.4145C1.35821 14.4728 1.38849 14.5261 1.43107 14.5686C1.47366 14.6111 1.52696 14.6413 1.58531 14.656C1.64367 14.6707 1.70491 14.6693 1.76254 14.6519L4.66454 13.7719C4.87332 13.7084 5.06332 13.5947 5.21787 13.4406L14.1159 4.54126Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M2 3.99992H14M12.6667 3.99992V13.3333C12.6667 13.9999 12 14.6666 11.3333 14.6666H4.66667C4 14.6666 3.33333 13.9999 3.33333 13.3333V3.99992M5.33333 3.99992V2.66659C5.33333 1.99992 6 1.33325 6.66667 1.33325H9.33333C10 1.33325 10.6667 1.99992 10.6667 2.66659V3.99992M6.66667 7.33325V11.3333M9.33333 7.33325V11.3333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M3.333 8H12.667M8 3.333V12.667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeTreeForSave(tree: readonly WorkspaceFolderNode[]): WorkspaceFolderNode[] {
  return tree
    .map((node) => {
      const label = node.label.trim();
      const children = node.children?.length ? normalizeTreeForSave(node.children) : undefined;
      return {
        id: node.id,
        label,
        ...(children?.length ? { children } : {}),
      };
    })
    .filter((node) => node.label.length > 0);
}

type SortableFolderRowProps = {
  item: FlattenedFolderItem;
  depth: number;
  indicator: boolean;
  isEditing: boolean;
  draftLabel: string;
  onDraftLabelChange: (value: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onDelete: () => void;
  editAriaLabel: string;
  deleteAriaLabel: string;
  clone?: boolean;
  childCount?: number;
};

function SortableFolderRow({
  item,
  depth,
  indicator,
  isEditing,
  draftLabel,
  onDraftLabelChange,
  onStartEdit,
  onCommitEdit,
  onDelete,
  editAriaLabel,
  deleteAriaLabel,
  clone = false,
  childCount,
}: SortableFolderRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    isDragging,
    isSorting,
    listeners,
    setDraggableNodeRef,
    setDroppableNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item.id,
    animateLayoutChanges: animateFolderLayoutChanges,
    disabled: isEditing || clone,
  });

  useEffect(() => {
    if (!isEditing || clone) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [clone, isEditing]);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  if (isDragging && indicator && !clone) {
    return (
      <div
        ref={(node) => {
          setDraggableNodeRef(node);
          setDroppableNodeRef(node);
        }}
        className={cn(ROW_SLOT_CLASS_NAME, "relative z-[1]")}
        style={style}
        aria-hidden
      >
        <div className="h-full" style={{ paddingLeft: depth * FOLDER_INDENT_PX }}>
          <div className="h-full rounded-xl border border-dashed border-primary/35 bg-muted/20" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={(node) => {
        setDraggableNodeRef(node);
        setDroppableNodeRef(node);
      }}
      className={cn(
        ROW_SLOT_CLASS_NAME,
        isDragging && !indicator && "opacity-50",
        isSorting && "pointer-events-none",
      )}
      style={style}
    >
      <FolderRowSurface
        label={item.label}
        depth={depth}
        isEditing={isEditing && !clone}
        draftLabel={draftLabel}
        onDraftLabelChange={onDraftLabelChange}
        onCommitEdit={onCommitEdit}
        inputRef={inputRef}
        showActions={!clone}
        onStartEdit={onStartEdit}
        onDelete={onDelete}
        editAriaLabel={editAriaLabel}
        deleteAriaLabel={deleteAriaLabel}
        dragHandleProps={isEditing || clone ? undefined : { ...attributes, ...listeners }}
        className={cn(clone && "shadow-md")}
        childCount={clone ? childCount : undefined}
      />
    </div>
  );
}

function FolderRowSurface({
  label,
  depth,
  isEditing,
  draftLabel,
  onDraftLabelChange,
  onCommitEdit,
  inputRef,
  showActions,
  onStartEdit,
  onDelete,
  editAriaLabel,
  deleteAriaLabel,
  dragHandleProps,
  actionsInvisible,
  childCount,
  className,
}: {
  label: string;
  depth: number;
  isEditing?: boolean;
  draftLabel?: string;
  onDraftLabelChange?: (value: string) => void;
  onCommitEdit?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  showActions?: boolean;
  actionsInvisible?: boolean;
  onStartEdit?: () => void;
  onDelete?: () => void;
  editAriaLabel?: string;
  deleteAriaLabel?: string;
  dragHandleProps?: Record<string, unknown>;
  childCount?: number;
  className?: string;
}) {
  return (
    <div className="relative h-full" style={{ paddingLeft: depth * FOLDER_INDENT_PX }}>
      <div
        className={cn(
          "flex h-full min-h-[56px] items-center gap-0 rounded-xl border border-border bg-background pl-0 pr-4",
          className,
        )}
      >
        <button
          type="button"
          className="flex h-full w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/70 active:cursor-grabbing"
          aria-hidden
          tabIndex={-1}
          {...dragHandleProps}
        >
          <GripIcon className="size-4" />
        </button>

        <div className="flex h-5 min-w-0 flex-1 items-center">
          {isEditing ? (
            <input
              ref={inputRef}
              value={draftLabel ?? ""}
              onChange={(event) => onDraftLabelChange?.(event.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  inputRef?.current?.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCommitEdit?.();
                }
              }}
              className="block m-0 h-5 w-full border-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none"
            />
          ) : (
            <span className="block w-full truncate text-sm leading-5 text-foreground">{label || " "}</span>
          )}
        </div>

        {showActions ? (
          <div className={cn("flex shrink-0 items-center gap-1", actionsInvisible && "invisible")}>
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              className="size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground"
              aria-label={editAriaLabel}
              onClick={onStartEdit}
            >
              <PencilIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              className="size-8 min-h-8 min-w-8 text-destructive hover:text-destructive"
              aria-label={deleteAriaLabel}
              onClick={onDelete}
            >
              <TrashIcon className="size-4" />
            </Button>
          </div>
        ) : null}
        {childCount && childCount > 1 ? (
          <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {childCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function FoldersSettingsPopup({ t }: FoldersSettingsPopupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { folderTree, replaceFolderTree } = useWorkspaceFolders();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = activePopup?.popupId === FOLDERS_POPUP_ID;

  const [draftTree, setDraftTree] = useState<WorkspaceFolderNode[]>(() => cloneWorkspaceFolderTree(folderTree));
  const [committedLabels, setCommittedLabels] = useState(() => buildCommittedLabelMap(folderTree));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overDragId, setOverDragId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftTree(cloneWorkspaceFolderTree(folderTree));
    setCommittedLabels(buildCommittedLabelMap(folderTree));
    setEditingId(null);
    setDraftLabels({});
  }, [open, folderTree]);

  const flattenedItems = useMemo(() => {
    const flattened = flattenFolderTree(draftTree);
    if (!activeDragId) {
      return flattened;
    }
    return removeFolderChildrenOf(flattened, [activeDragId]);
  }, [activeDragId, draftTree]);

  const sortedIds = useMemo(() => flattenedItems.map((item) => item.id), [flattenedItems]);

  const projected = useMemo(() => {
    if (!activeDragId || !overDragId) {
      return null;
    }
    return getFolderTreeProjection(flattenedItems, activeDragId, overDragId, offsetLeft, FOLDER_INDENT_PX);
  }, [activeDragId, flattenedItems, offsetLeft, overDragId]);

  const activeItem = activeDragId ? flattenedItems.find((item) => item.id === activeDragId) : null;

  function closePopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function commitFolderLabel(
    tree: WorkspaceFolderNode[],
    folderId: string,
    rawValue: string,
    labels: Map<string, string>,
  ): { tree: WorkspaceFolderNode[]; labels: Map<string, string>; removeEditing: boolean } {
    const trimmed = rawValue.trim();
    const hadCommittedLabel = labels.has(folderId);

    if (!trimmed) {
      if (!hadCommittedLabel) {
        return {
          tree: removeWorkspaceFolderById(tree, folderId),
          labels,
          removeEditing: true,
        };
      }
      const previous = labels.get(folderId) ?? "";
      return {
        tree: updateWorkspaceFolderLabel(tree, folderId, previous),
        labels,
        removeEditing: true,
      };
    }

    return {
      tree: updateWorkspaceFolderLabel(tree, folderId, trimmed),
      labels: new Map(labels).set(folderId, trimmed),
      removeEditing: true,
    };
  }

  function applyBlurRules(folderId: string, rawValue: string) {
    const result = commitFolderLabel(draftTree, folderId, rawValue, committedLabels);
    setDraftTree(result.tree);
    setCommittedLabels(result.labels);
    if (result.removeEditing) {
      setEditingId((current) => (current === folderId ? null : current));
    }
  }

  function handleAddFolder() {
    const { tree, id } = createDraftWorkspaceFolderAtRoot(draftTree);
    setDraftTree(tree);
    setEditingId(id);
    setDraftLabels((current) => ({ ...current, [id]: "" }));
  }

  function handleSave() {
    let nextTree = draftTree;
    let nextCommitted = committedLabels;
    if (editingId) {
      const result = commitFolderLabel(nextTree, editingId, draftLabels[editingId] ?? "", nextCommitted);
      nextTree = result.tree;
      nextCommitted = result.labels;
    }
    replaceFolderTree(normalizeTreeForSave(nextTree));
    setCommittedLabels(nextCommitted);
    closePopup();
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    setActiveDragId(activeId);
    setOverDragId(activeId);
    setOffsetLeft(0);
    document.body.style.setProperty("cursor", "grabbing");
  }

  function handleDragMove(event: DragMoveEvent) {
    setOffsetLeft(event.delta.x);
  }

  function handleDragOver(event: DragOverEvent) {
    setOverDragId(event.over ? String(event.over.id) : null);
  }

  function resetDragState() {
    setActiveDragId(null);
    setOverDragId(null);
    setOffsetLeft(0);
    document.body.style.setProperty("cursor", "");
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const dragOffset = offsetLeft;
    resetDragState();

    if (!overId) {
      return;
    }

    setDraftTree((current) => {
      const flattened = flattenFolderTree(current);
      const visible = removeFolderChildrenOf(flattened, [activeId]);
      const projection = getFolderTreeProjection(visible, activeId, overId, dragOffset, FOLDER_INDENT_PX);
      if (!projection) {
        return current;
      }
      return applyFolderTreeDrag(current, activeId, overId, projection);
    });
  }

  function handleDragCancel() {
    resetDragState();
  }

  if (!open) {
    return null;
  }

  const dragOverlayChildCount =
    activeDragId && activeItem ? getFolderDescendantCount(draftTree, activeDragId) + 1 : undefined;

  return (
    <Popup
      id={FOLDERS_POPUP_ID}
      header={t("web.foldersPopup.title")}
      description={t("web.foldersPopup.description")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={closePopup}
      width={720}
      panelClassName="min-h-[560px]"
      footer={
        <>
          <Button type="button" variant="outline" className="h-9 rounded-lg px-4" onClick={closePopup}>
            {t("web.foldersPopup.cancel")}
          </Button>
          <Button type="button" className="h-9 rounded-lg px-4" onClick={handleSave}>
            {t("web.foldersPopup.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          measuring={folderTreeMeasuring}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {flattenedItems.map((item) => {
                const isEditing = editingId === item.id;
                const draftLabel = isEditing ? (draftLabels[item.id] ?? item.label) : item.label;
                const depth = item.id === activeDragId && projected ? projected.depth : item.depth;

                return (
                  <SortableFolderRow
                    key={item.id}
                    item={item}
                    depth={depth}
                    indicator
                    isEditing={isEditing}
                    draftLabel={draftLabel}
                    onDraftLabelChange={(value) =>
                      setDraftLabels((current) => ({ ...current, [item.id]: value }))
                    }
                    onStartEdit={() => {
                      if (editingId && editingId !== item.id) {
                        applyBlurRules(editingId, draftLabels[editingId] ?? "");
                      }
                      setEditingId(item.id);
                      setDraftLabels((current) => ({
                        ...current,
                        [item.id]: current[item.id] ?? item.label,
                      }));
                    }}
                    onCommitEdit={() => applyBlurRules(item.id, draftLabels[item.id] ?? item.label)}
                    onDelete={() => {
                      if (editingId === item.id) {
                        setEditingId(null);
                      }
                      setDraftTree((current) => removeWorkspaceFolderById(current, item.id));
                    }}
                    editAriaLabel={t("web.foldersPopup.editFolder")}
                    deleteAriaLabel={t("web.foldersPopup.deleteFolder")}
                  />
                );
              })}
            </div>
          </SortableContext>

          {createPortal(
            <DragOverlay dropAnimation={null}>
              {activeDragId && activeItem ? (
                <SortableFolderRow
                  item={activeItem}
                  depth={activeItem.depth}
                  indicator={false}
                  isEditing={false}
                  draftLabel={activeItem.label}
                  clone
                  childCount={dragOverlayChildCount}
                  onDraftLabelChange={() => undefined}
                  onStartEdit={() => undefined}
                  onCommitEdit={() => undefined}
                  onDelete={() => undefined}
                  editAriaLabel=""
                  deleteAriaLabel=""
                />
              ) : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>

        <Button
          type="button"
          variant="secondary"
          className="h-9 w-full rounded-lg bg-slate-100 font-medium text-foreground shadow-none hover:bg-slate-200/90 dark:bg-muted dark:hover:bg-muted/80"
          onClick={handleAddFolder}
        >
          <PlusIcon className="size-4" />
          {t("web.foldersPopup.addFolder")}
        </Button>
      </div>
    </Popup>
  );
}
