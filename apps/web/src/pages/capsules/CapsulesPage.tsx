import type { CapsuleOwnerListEntryDto } from "@okkey/types";
import {
  Breadcrumb,
  BreadcrumbBar,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  cn,
} from "@okkey/ui";
import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import {
  decryptOwnerCapsuleMetadata,
  recoverOwnerCapsuleFragment,
  type CapsuleOwnerMetadata,
} from "../../capsules/crypto";
import { subscribeCapsulesListRefresh } from "../../capsules/capsulesListRefresh";
import { useLocale } from "../../locale/LocaleContext";
import { itemsPathAllWorkspaceMerged } from "../../routes/paths";
import {
  EDIT_CAPSULE_POPUP_ID,
  NEW_CAPSULE_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import CapsuleActionsMenu from "../../components/capsules/CapsuleActionsMenu";
import DeleteCapsulesConfirmPopup from "../../components/capsules/DeleteCapsulesConfirmPopup";
import { CapsuleCheckIcon, CapsuleCloseIcon, CapsuleColumnsIcon, CapsuleSearchIcon } from "../../components/capsules/capsuleIcons";
import {
  CAPSULE_TABLE_COLUMN_IDS,
  CAPSULE_TABLE_COLUMN_LABELS,
  CAPSULE_TABLE_LOCKED_COLUMN,
  CAPSULE_TABLE_PAGE_SIZE,
  buildCapsulePageItems,
  capsulePageRowCount,
  loadVisibleCapsuleColumns,
  normalizeVisibleCapsuleColumns,
  saveVisibleCapsuleColumns,
  type CapsuleTableColumnId,
} from "../../components/capsules/capsuleTableColumns";

interface CapsulesPageProps {
  workspaceId: string;
  workspaceName: string;
  canCreate: boolean;
}

type DecryptedCapsule = CapsuleOwnerListEntryDto & { ownerMetadata: CapsuleOwnerMetadata };

const ROW_CLASS_NAME = "h-14";
const CELL_CLASS_NAME = "h-14 px-3 py-0 align-middle";
const ROW_CONTROL_CELL_CLASS_NAME = `${CELL_CLASS_NAME} relative z-20`;

export default function CapsulesPage({ workspaceId, workspaceName, canCreate }: CapsulesPageProps) {
  const core = useAuthenticatedCoreClient();
  const { vaultKey } = useAuthVault();
  const { t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const itemsHref = itemsPathAllWorkspaceMerged(searchParams);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [capsules, setCapsules] = useState<DecryptedCapsule[]>([]);
  const [search, setSearch] = useState("");
  const [selectedById, setSelectedById] = useState<Map<string, DecryptedCapsule>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<CapsuleTableColumnId[]>(() => loadVisibleCapsuleColumns());
  const [deleteConfirm, setDeleteConfirm] = useState<DecryptedCapsule[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const editingCapsuleId =
    activePopup?.popupId === EDIT_CAPSULE_POPUP_ID ? activePopup.menuItemId?.trim() ?? "" : "";

  const decryptPage = useCallback(
    async (entries: CapsuleOwnerListEntryDto[]) => {
      if (!vaultKey) return [];
      return Promise.all(
        entries.map(async (capsule) => ({
          ...capsule,
          ownerMetadata: await decryptOwnerCapsuleMetadata(
            vaultKey,
            capsule.encryptedMetadata,
            capsule.ownerKeyWrap,
          ),
        })),
      );
    },
    [vaultKey],
  );

  const syncSelectedCapsules = useCallback((entries: DecryptedCapsule[]) => {
    setSelectedById((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Map(current);
      for (const capsule of entries) {
        if (next.has(capsule.capsuleId)) {
          next.set(capsule.capsuleId, capsule);
        }
      }
      return next;
    });
  }, []);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!core || !vaultKey) return;
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const query = search.trim().toLocaleLowerCase();
      if (query) {
        const all: CapsuleOwnerListEntryDto[] = [];
        let cursorPage = 1;
        while (true) {
          const response = await core.listCapsules(workspaceId, cursorPage);
          all.push(...response.capsules);
          if (!response.hasMore) break;
          cursorPage += 1;
        }
        const decrypted = await decryptPage(all);
        const filtered = decrypted.filter((capsule) =>
          capsule.ownerMetadata.name.toLocaleLowerCase().includes(query),
        );
        const pageCapsules = filtered.slice(
          (page - 1) * CAPSULE_TABLE_PAGE_SIZE,
          page * CAPSULE_TABLE_PAGE_SIZE,
        );
        setCapsules(pageCapsules);
        setTotal(filtered.length);
        syncSelectedCapsules(filtered);
      } else {
        const response = await core.listCapsules(workspaceId, page);
        const decrypted = await decryptPage(response.capsules);
        setCapsules(decrypted);
        setTotal(response.total);
        syncSelectedCapsules(decrypted);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить капсулы");
    } finally {
      setLoading(false);
    }
  }, [core, decryptPage, page, search, syncSelectedCapsules, vaultKey, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeCapsulesListRefresh(() => {
    void load({ silent: true });
  }), [load]);

  const pageCount = Math.max(1, Math.ceil(total / CAPSULE_TABLE_PAGE_SIZE));
  const skeletonRowCount = capsulePageRowCount(page, total, CAPSULE_TABLE_PAGE_SIZE);
  const selectedCapsules = useMemo(() => [...selectedById.values()], [selectedById]);
  const selectedCount = selectedCapsules.length;
  const allSelected = capsules.length > 0 && capsules.every((capsule) => selectedById.has(capsule.capsuleId));
  const pageItems = useMemo(() => buildCapsulePageItems(page, pageCount), [page, pageCount]);
  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const tableColSpan = 2 + visibleColumns.length;
  const onlyNameColumn = visibleColumns.length === 1 && visibleColumns[0] === "name";

  const openCreate = () => {
    navigate({
      pathname: location.pathname,
      search: popupQuerySearch(location.search, NEW_CAPSULE_POPUP_ID),
      hash: location.hash,
    });
  };

  const openEdit = (capsuleId: string) => {
    navigate({
      pathname: location.pathname,
      search: popupQuerySearch(location.search, buildPopupQueryValue(EDIT_CAPSULE_POPUP_ID, capsuleId)),
      hash: location.hash,
    });
  };

  const closeEdit = () => {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: true },
    );
  };

  const setCapsuleSelected = (capsule: DecryptedCapsule, checked: boolean) => {
    setSelectedById((current) => {
      const next = new Map(current);
      if (checked) {
        next.set(capsule.capsuleId, capsule);
      } else {
        next.delete(capsule.capsuleId);
      }
      return next;
    });
  };

  const setPageSelected = (checked: boolean) => {
    setSelectedById((current) => {
      const next = new Map(current);
      for (const capsule of capsules) {
        if (checked) {
          next.set(capsule.capsuleId, capsule);
        } else {
          next.delete(capsule.capsuleId);
        }
      }
      return next;
    });
  };

  const toggleColumn = (columnId: CapsuleTableColumnId) => {
    if (columnId === CAPSULE_TABLE_LOCKED_COLUMN) {
      return;
    }
    setVisibleColumns((current) => {
      const next = current.includes(columnId)
        ? current.filter((id) => id !== columnId)
        : [...current, columnId];
      const normalized = normalizeVisibleCapsuleColumns(next);
      saveVisibleCapsuleColumns(normalized);
      return normalized;
    });
  };

  const changeState = async (targets: DecryptedCapsule[], state: "active" | "inactive") => {
    if (!core || targets.length === 0) return;
    await Promise.all(targets.map((capsule) => core.setCapsuleState(capsule.capsuleId, state)));
    toast.success(
      state === "inactive"
        ? targets.length === 1
          ? "Капсула деактивирована"
          : "Капсулы деактивированы"
        : targets.length === 1
          ? "Капсула активирована"
          : "Капсулы активированы",
    );
    await load({ silent: true });
  };

  const remove = async (targets: DecryptedCapsule[]) => {
    if (!core || targets.length === 0) return;
    setDeleting(true);
    try {
      const ids = new Set(targets.map((capsule) => capsule.capsuleId));
      await Promise.all(targets.map((capsule) => core.deleteCapsule(capsule.capsuleId)));
      setSelectedById((current) => {
        const next = new Map(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      if (editingCapsuleId && ids.has(editingCapsuleId)) {
        closeEdit();
      }
      toast.success(targets.length === 1 ? "Капсула удалена" : "Капсулы удалены");
      setDeleteConfirm(null);
      await load({ silent: true });
    } finally {
      setDeleting(false);
    }
  };

  const copyLink = async (targets: DecryptedCapsule[]) => {
    if (!vaultKey || targets.length === 0) return;
    const links = await Promise.all(
      targets.map(async (capsule) => {
        const fragment = await recoverOwnerCapsuleFragment(vaultKey, capsule.ownerKeyWrap);
        return `${window.location.origin}/capsule/${capsule.capsuleId}#key=${fragment}`;
      }),
    );
    await navigator.clipboard.writeText(links.join("\n"));
    toast.success(targets.length === 1 ? "Ссылка скопирована" : "Ссылки скопированы");
  };

  const selectedCanActivate = selectedCapsules.some((capsule) => capsule.state !== "active");
  const selectedCanDeactivate = selectedCapsules.some((capsule) => capsule.state === "active");

  return (
    <div className="flex h-full flex-col bg-background">
      <BreadcrumbBar className="flex">
        <Breadcrumb aria-label={t("web.nav.capsules")}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={itemsHref} title={workspaceName}>
                  <span className="truncate">{workspaceName}</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage title={t("web.nav.capsules")}>
                {t("web.nav.capsules")}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </BreadcrumbBar>
      <main className="mx-auto flex w-full max-w-[948px] flex-col gap-9 px-6 py-8">
        <section className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold text-foreground">{t("web.nav.capsules")}</h1>
          <div className="flex items-center gap-6">
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
              Капсулы — это специальные зашифрованные записи для безопасной передачи по электронной почте или в чате.{" "}
              <a
                className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                href="/docs/capsules"
                target="_blank"
                rel="noopener noreferrer"
              >
                Подробнее
                <LearnMoreExternalLinkIcon />
              </a>
            </p>
            {canCreate ? (
              <Button className="shrink-0" onClick={openCreate}>
                <PlusIcon data-icon="inline-start" />
                Создать капсулу
              </Button>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <CapsuleSearchIcon className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Поиск по названию..."
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <CapsuleColumnsIcon data-icon="inline-start" />
                  Колонки
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56 p-1">
                <DropdownMenuGroup>
                  {CAPSULE_TABLE_COLUMN_IDS.map((columnId) => {
                    const locked = columnId === CAPSULE_TABLE_LOCKED_COLUMN;
                    const checked = visibleColumnSet.has(columnId);
                    return (
                      <DropdownMenuItem
                        key={columnId}
                        className="gap-2"
                        disabled={locked}
                        onSelect={(event) => {
                          event.preventDefault();
                          toggleColumn(columnId);
                        }}
                      >
                        {checked ? (
                          <CapsuleCheckIcon className="size-4 shrink-0" />
                        ) : (
                          <span className="size-4 shrink-0" aria-hidden />
                        )}
                        <span>{CAPSULE_TABLE_COLUMN_LABELS[columnId]}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table
              className={cn(
                "w-full border-collapse text-left text-sm",
                onlyNameColumn ? "table-fixed" : "min-w-[780px]",
              )}
            >
              <thead className="bg-secondary">
                <tr className={ROW_CLASS_NAME}>
                  <th className={cn(CELL_CLASS_NAME, "w-10")}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => setPageSelected(Boolean(checked))}
                    />
                  </th>
                  {visibleColumns.includes("name") ? (
                    <th
                      className={cn(CELL_CLASS_NAME, "font-medium", !onlyNameColumn && "w-52")}
                    >
                      Название
                    </th>
                  ) : null}
                  {visibleColumns.includes("type") ? (
                    <th className={cn(CELL_CLASS_NAME, "font-medium")}>Тип</th>
                  ) : null}
                  {visibleColumns.includes("created") ? (
                    <th className={cn(CELL_CLASS_NAME, "font-medium")}>Создан</th>
                  ) : null}
                  {visibleColumns.includes("active") ? (
                    <th className={cn(CELL_CLASS_NAME, "font-medium")}>Активен</th>
                  ) : null}
                  {visibleColumns.includes("views") ? (
                    <th className={cn(CELL_CLASS_NAME, "font-medium")}>Просмотров</th>
                  ) : null}
                  {visibleColumns.includes("password") ? (
                    <th className={cn(CELL_CLASS_NAME, "font-medium")}>С паролем</th>
                  ) : null}
                  <th className={cn(CELL_CLASS_NAME, "w-12")} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: skeletonRowCount }, (_, index) => (
                    <tr key={index} className={cn(ROW_CLASS_NAME, "border-t")}>
                      <td className={cn(CELL_CLASS_NAME, "w-10")}>
                        <Skeleton className="size-4 rounded" />
                      </td>
                      {visibleColumns.includes("name") ? (
                        <td className={cn(CELL_CLASS_NAME, onlyNameColumn ? undefined : "max-w-52")}>
                          <Skeleton className="h-4 w-40 max-w-full" />
                        </td>
                      ) : null}
                      {visibleColumns.includes("type") ? (
                        <td className={CELL_CLASS_NAME}>
                          <Skeleton className="h-4 w-16" />
                        </td>
                      ) : null}
                      {visibleColumns.includes("created") ? (
                        <td className={CELL_CLASS_NAME}>
                          <Skeleton className="h-4 w-24" />
                        </td>
                      ) : null}
                      {visibleColumns.includes("active") ? (
                        <td className={CELL_CLASS_NAME}>
                          <Skeleton className="h-4 w-20" />
                        </td>
                      ) : null}
                      {visibleColumns.includes("views") ? (
                        <td className={CELL_CLASS_NAME}>
                          <Skeleton className="h-4 w-12" />
                        </td>
                      ) : null}
                      {visibleColumns.includes("password") ? (
                        <td className={CELL_CLASS_NAME}>
                          <Skeleton className="h-4 w-10" />
                        </td>
                      ) : null}
                      <td className={cn(CELL_CLASS_NAME, "w-12")}>
                        <Skeleton className="size-8 rounded-md" />
                      </td>
                    </tr>
                  ))
                ) : capsules.length ? (
                  capsules.map((capsule) => (
                    <tr
                      key={capsule.capsuleId}
                      className={cn(ROW_CLASS_NAME, "relative border-t hover:bg-muted/60")}
                    >
                      <td
                        className={cn(ROW_CONTROL_CELL_CLASS_NAME, "w-10")}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedById.has(capsule.capsuleId)}
                          onCheckedChange={(checked) => setCapsuleSelected(capsule, Boolean(checked))}
                        />
                      </td>
                      {visibleColumns.includes("name") ? (
                        <td className={cn(CELL_CLASS_NAME, onlyNameColumn ? "min-w-0" : "max-w-52")}>
                          <span className="block truncate">{capsule.ownerMetadata.name}</span>
                        </td>
                      ) : null}
                      {visibleColumns.includes("type") ? (
                        <td className={CELL_CLASS_NAME}>{typeLabel(capsule.type)}</td>
                      ) : null}
                      {visibleColumns.includes("created") ? (
                        <td className={CELL_CLASS_NAME}>{formatDate(capsule.createdAt)}</td>
                      ) : null}
                      {visibleColumns.includes("active") ? (
                        <td className={CELL_CLASS_NAME}>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                capsule.state === "active" ? "bg-green-500" : "bg-muted-foreground/40",
                              )}
                              aria-hidden
                            />
                            {capsule.state === "active"
                              ? capsule.deactivateAt
                                ? `до ${formatDate(capsule.deactivateAt)}`
                                : "Да"
                              : "Нет"}
                          </span>
                        </td>
                      ) : null}
                      {visibleColumns.includes("views") ? (
                        <td className={CELL_CLASS_NAME}>
                          {capsule.viewCount}/{capsule.maxViews ?? "∞"}
                        </td>
                      ) : null}
                      {visibleColumns.includes("password") ? (
                        <td className={CELL_CLASS_NAME}>{capsule.passwordRequired ? "Да" : "Нет"}</td>
                      ) : null}
                      <td
                        className={cn(CELL_CLASS_NAME, "w-12")}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={capsule.ownerMetadata.name || "Открыть капсулу"}
                          className="absolute inset-0 z-[1] cursor-pointer"
                          onClick={() => openEdit(capsule.capsuleId)}
                        />
                        <div className="relative z-20">
                          <CapsuleActionsMenu
                            t={t}
                            variant="icon"
                            canActivate={capsule.state !== "active"}
                            canDeactivate={capsule.state === "active"}
                            onCopy={() => void copyLink([capsule])}
                            onActivate={() => void changeState([capsule], "active")}
                            onDeactivate={() => void changeState([capsule], "inactive")}
                            onDelete={() => setDeleteConfirm([capsule])}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t">
                    <td colSpan={tableColSpan} className="px-3 py-10 text-center">
                      {error ? (
                        <p className="text-sm text-muted-foreground">{error}</p>
                      ) : search.trim() ? (
                        <p className="text-sm text-muted-foreground">
                          {t("web.capsules.list.searchEmpty", { query: search.trim() })}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("web.capsules.list.empty")}</p>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedCount > 0 ? (
            <footer className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("web.capsules.list.exitSelectionAria")}
                onClick={() => setSelectedById(new Map())}
              >
                <CapsuleCloseIcon />
              </Button>
              <p className="min-w-0 flex-1 truncate text-left text-sm text-foreground">
                {t("web.capsules.list.selectionCount", { count: selectedCount })}
              </p>
              <CapsuleActionsMenu
                t={t}
                variant="button"
                align="end"
                canActivate={selectedCanActivate}
                canDeactivate={selectedCanDeactivate}
                onCopy={() => void copyLink(selectedCapsules)}
                onActivate={() =>
                  void changeState(
                    selectedCapsules.filter((capsule) => capsule.state !== "active"),
                    "active",
                  )
                }
                onDeactivate={() =>
                  void changeState(
                    selectedCapsules.filter((capsule) => capsule.state === "active"),
                    "inactive",
                  )
                }
                onDelete={() => setDeleteConfirm(selectedCapsules)}
              />
            </footer>
          ) : pageCount > 1 ? (
            <footer className="flex items-center justify-end">
              <div className="relative flex w-fit rounded-lg bg-secondary p-1" aria-label="Страницы">
                {pageItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="inline-flex h-8 min-w-8 items-center justify-center px-2 text-sm text-muted-foreground"
                      aria-hidden
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      type="button"
                      size="sm"
                      variant={item === page ? "outline" : "ghost"}
                      aria-current={item === page ? "page" : undefined}
                      tabIndex={item === page ? -1 : undefined}
                      className={cn(
                        "relative min-w-8 border",
                        item === page
                          ? cn(
                              "z-10 pointer-events-none",
                              "!bg-background hover:!bg-background active:!bg-background",
                              "hover:!border-input focus:!border-input focus-visible:!border-input",
                              "!shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                              "dark:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                            )
                          : cn(
                              "z-0 border-transparent shadow-none",
                              "hover:border-transparent hover:bg-foreground/5",
                              "focus:shadow-none focus-visible:shadow-none",
                              "focus:bg-foreground/10 focus-visible:bg-foreground/10",
                              "active:bg-foreground/10",
                            ),
                      )}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  ),
                )}
              </div>
            </footer>
          ) : null}
        </section>
      </main>
      <DeleteCapsulesConfirmPopup
        open={deleteConfirm !== null}
        multiple={(deleteConfirm?.length ?? 0) > 1}
        deleting={deleting}
        t={t}
        onClose={() => {
          if (!deleting) setDeleteConfirm(null);
        }}
        onConfirm={() => {
          if (deleteConfirm) void remove(deleteConfirm);
        }}
      />
    </div>
  );
}

function typeLabel(type: DecryptedCapsule["type"]): string {
  return type === "text" ? "Текст" : type === "file" ? "Файл" : "Запись";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function LearnMoreExternalLinkIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="size-4 shrink-0"
    >
      <path
        d="M14 6V2H10M14 2L6.66667 9.33333M12 8.66667V12.6667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V5.33333C2 4.97971 2.14048 4.64057 2.39052 4.39052C2.64057 4.14048 2.97971 4 3.33333 4H7.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
