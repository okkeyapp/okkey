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
} from "@okkey/ui";
import {
  Columns3Icon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import {
  decryptOwnerCapsuleMetadata,
  recoverOwnerCapsuleFragment,
  type CapsuleOwnerMetadata,
} from "../../capsules/crypto";
import { useLocale } from "../../locale/LocaleContext";
import { itemsPathAllWorkspaceMerged } from "../../routes/paths";
import {
  NEW_CAPSULE_POPUP_ID,
  popupQuerySearch,
} from "../../routes/popupQuery";

interface CapsulesPageProps {
  workspaceId: string;
  workspaceName: string;
  canCreate: boolean;
}

type DecryptedCapsule = CapsuleOwnerListEntryDto & { ownerMetadata: CapsuleOwnerMetadata };

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    if (!core || !vaultKey) return;
    setLoading(true);
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
        setCapsules(filtered.slice((page - 1) * 30, page * 30));
        setTotal(filtered.length);
      } else {
        const response = await core.listCapsules(workspaceId, page);
        setCapsules(await decryptPage(response.capsules));
        setTotal(response.total);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить капсулы");
    } finally {
      setLoading(false);
    }
  }, [core, decryptPage, page, search, vaultKey, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / 30));
  const allSelected = capsules.length > 0 && capsules.every((capsule) => selectedIds.includes(capsule.capsuleId));
  const selectedCount = selectedIds.length;

  const openCreate = () => {
    navigate({
      pathname: location.pathname,
      search: popupQuerySearch(location.search, NEW_CAPSULE_POPUP_ID),
      hash: location.hash,
    });
  };

  const changeState = async (capsule: DecryptedCapsule) => {
    if (!core) return;
    await core.setCapsuleState(capsule.capsuleId, capsule.state === "active" ? "inactive" : "active");
    toast.success(capsule.state === "active" ? "Капсула деактивирована" : "Капсула активирована");
    await load();
  };

  const remove = async (capsuleIds: string[]) => {
    if (!core || capsuleIds.length === 0) return;
    await Promise.all(capsuleIds.map((capsuleId) => core.deleteCapsule(capsuleId)));
    setSelectedIds([]);
    toast.success(capsuleIds.length === 1 ? "Капсула удалена" : "Капсулы удалены");
    await load();
  };

  const copyLink = async (capsule: DecryptedCapsule) => {
    if (!vaultKey) return;
    const fragment = await recoverOwnerCapsuleFragment(vaultKey, capsule.ownerKeyWrap);
    await navigator.clipboard.writeText(
      `${window.location.origin}/capsule/${capsule.capsuleId}#key=${fragment}`,
    );
    toast.success("Ссылка скопирована");
  };

  const rows = useMemo(() => capsules, [capsules]);

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
          <h1 className="text-lg font-semibold">{t("web.nav.capsules")}</h1>
          <div className="flex items-center gap-6">
            <p className="flex-1 text-sm text-muted-foreground">
              Капсулы — это специальные зашифрованные записи для безопасной передачи по электронной почте или в чате.{" "}
              <a className="font-medium text-foreground" href="/docs/capsules" target="_blank" rel="noreferrer">
                Подробнее <ExternalLinkIcon className="inline size-4" />
              </a>
            </p>
            {canCreate ? (
              <Button onClick={openCreate}><PlusIcon data-icon="inline-start" />Создать капсулу</Button>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <SearchIcon className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
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
            <Button variant="outline"><Columns3Icon data-icon="inline-start" />Колонки</Button>
          </div>

          {selectedCount > 0 ? (
            <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
              <span className="text-sm">Выбрано: {selectedCount}</span>
              <Button size="sm" variant="destructive" onClick={() => void remove(selectedIds)}>
                <Trash2Icon data-icon="inline-start" />Удалить
              </Button>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="w-10 p-2"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelectedIds(checked ? capsules.map((capsule) => capsule.capsuleId) : [])} /></th>
                  <th className="w-52 p-2 font-medium">Название</th>
                  <th className="p-2 font-medium">Тип</th>
                  <th className="p-2 font-medium">Создан</th>
                  <th className="p-2 font-medium">Активен</th>
                  <th className="p-2 font-medium">Просмотров</th>
                  <th className="p-2 font-medium">С паролем</th>
                  <th className="w-12 p-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 3 }, (_, index) => (
                  <tr key={index} className="border-t"><td colSpan={8} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
                )) : rows.length ? rows.map((capsule) => (
                  <tr key={capsule.capsuleId} className="border-t">
                    <td className="p-2"><Checkbox checked={selectedIds.includes(capsule.capsuleId)} onCheckedChange={(checked) => setSelectedIds((current) => checked ? [...current, capsule.capsuleId] : current.filter((id) => id !== capsule.capsuleId))} /></td>
                    <td className="max-w-52 truncate p-2">{capsule.ownerMetadata.name}</td>
                    <td className="p-2">{typeLabel(capsule.type)}</td>
                    <td className="p-2">{formatDate(capsule.createdAt)}</td>
                    <td className="p-2">{capsule.state === "active" ? capsule.deactivateAt ? `до ${formatDate(capsule.deactivateAt)}` : "Да" : "Нет"}</td>
                    <td className="p-2">{capsule.viewCount}/{capsule.maxViews ?? "∞"}</td>
                    <td className="p-2">{capsule.passwordRequired ? "Да" : "Нет"}</td>
                    <td className="p-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="iconSm" variant="ghost"><EllipsisIcon /><span className="sr-only">Действия</span></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => void copyLink(capsule)}><CopyIcon />Копировать ссылку</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void changeState(capsule)}>{capsule.state === "active" ? <PauseIcon /> : <PlayIcon />}{capsule.state === "active" ? "Деактивировать" : "Активировать"}</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onSelect={() => void remove([capsule.capsuleId])}><Trash2Icon />Удалить</DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">{error ?? "Капсул пока нет"}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <footer className="flex items-center gap-2">
            <span className="flex-1 text-sm text-muted-foreground">Выделено {selectedCount} из {total}</span>
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</Button>
            <span className="text-sm text-muted-foreground">{page} / {pageCount}</span>
            <Button variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Вперёд</Button>
          </footer>
        </section>
      </main>
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
