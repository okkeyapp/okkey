import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Workspace } from "@okkey/types";

import { FOLDER_QUERY_PARAM, ITEM_QUERY_PARAM, ITEMS_PATH, VAULT_QUERY_PARAM } from "../routes/paths";
import WorkspaceRoutesLayout from "./WorkspaceRoutesLayout";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  listWorkspaceVaults: vi.fn(),
  logout: vi.fn(),
  folderTree: [] as Array<{ id: string; label: string; children?: Array<{ id: string; label: string }> }>,
  foldersLoading: false,
  foldersBootstrapped: false,
  core: null as null | {
    listWorkspaces: ReturnType<typeof vi.fn>;
    listWorkspaceVaults: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    userId: "user-1",
    profile: { email: "sasha@okkey.local", firstName: "Sasha", lastName: "Okkey" },
    logout: mocks.logout,
    passwordShareC: new Uint8Array(32),
    vaultKey: new Uint8Array(32),
    vaultUnlocked: true,
  }),
  useAuthenticatedCoreClient: () => mocks.core,
}));

vi.mock("../items/WorkspaceItemsContext", () => ({
  WorkspaceItemsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useWorkspaceItemsState: () => ({
    records: [],
    items: [],
    loading: false,
    bootstrapped: true,
    error: null,
    syncVersion: 0,
    getItemById: () => undefined,
    getItemActivityById: () => [],
    createItem: vi.fn(),
    updateItem: vi.fn(),
    updateItemQuiet: vi.fn(),
    setItemArchived: vi.fn(),
    setItemsArchived: vi.fn(),
    setItemDeleted: vi.fn(),
    setItemsDeleted: vi.fn(),
    refreshItems: vi.fn(),
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: ["jpg", "png", "pdf", "zip", "rar"],
    maxFileSizeMb: 2,
    filesInItemsEnabled: true,
  }),
  useWorkspaceItems: () => ({
    records: [],
    items: [],
    loading: false,
    bootstrapped: true,
    error: null,
    syncVersion: 0,
    getItemById: () => undefined,
    getItemActivityById: () => [],
    createItem: vi.fn(),
    updateItem: vi.fn(),
    updateItemQuiet: vi.fn(),
    setItemArchived: vi.fn(),
    setItemsArchived: vi.fn(),
    setItemDeleted: vi.fn(),
    setItemsDeleted: vi.fn(),
    refreshItems: vi.fn(),
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: ["jpg", "png", "pdf", "zip", "rar"],
    maxFileSizeMb: 2,
    filesInItemsEnabled: true,
  }),
}));

vi.mock("../folders/WorkspaceFoldersContext", () => ({
  WorkspaceFoldersProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useWorkspaceFolders: () => ({
    itemFolderByItemId: new Map(),
    itemFavoriteByItemId: new Set(),
    flatFolders: [],
    folderTree: [],
    createFolder: vi.fn(),
    assignItemToFolder: vi.fn(),
    setItemFavorite: vi.fn(),
    setItemsFavorite: vi.fn(),
  }),
  useWorkspaceFoldersState: () => ({
    folderTree: mocks.folderTree,
    flatFolders: [],
    itemFolderByItemId: new Map(),
    itemFavoriteByItemId: new Set(),
    loading: mocks.foldersLoading,
    bootstrapped: mocks.foldersBootstrapped,
    error: null,
    syncVersion: 0,
    createFolder: vi.fn(),
    commitFolderTree: vi.fn().mockResolvedValue(undefined),
    assignItemToFolder: vi.fn(),
    setItemFavorite: vi.fn(),
    setItemsFavorite: vi.fn(),
  }),
}));

vi.mock("../locale/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en",
    t: (key: string, params?: Record<string, string>) => (params?.id ? `${key}:${params.id}` : key),
  }),
}));

vi.mock("../components/items/NewItemPopup", () => ({
  default: () => null,
}));
vi.mock("../components/items/EditItemPopup", () => ({
  default: () => null,
}));

vi.mock("../components/folders/FoldersSettingsPopup", () => ({
  default: () => null,
}));

vi.mock("../components/settings/SettingsPopup", () => ({
  default: ({
    children,
  }: {
    children: (args: { openSettingsPopup: () => void }) => ReactNode;
    t: unknown;
  }) => children({ openSettingsPopup: () => {} }),
}));

vi.mock("@okkey/ui", () => ({
  cn: (...classes: Array<string | undefined | false | null>) => classes.filter(Boolean).join(" "),
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  okkeyWorkspaceShellNavItems: () => [],
  PersonalWorkspaceMark: () => <span data-testid="personal-workspace-mark" />,
  Spinner: () => <span>Loading</span>,
  workspaceSwitcherActiveItemClassName: "active",
}));

vi.mock("../components/workspace/WorkspaceSidebarLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <main data-testid="workspace-layout">{children}</main>,
}));

function QueryParamProbe() {
  const [searchParams, setSearchParams] = useSearchParams();
  const itemId = searchParams.get(ITEM_QUERY_PARAM) ?? "";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set(ITEM_QUERY_PARAM, "item-1");
            return next;
          });
        }}
      >
        Select item
      </button>
      <div data-testid="item-query">{itemId}</div>
      <div data-testid="search-query">{searchParams.toString()}</div>
    </>
  );
}

function renderWorkspaceShell(initialEntry = ITEMS_PATH) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<WorkspaceRoutesLayout />}>
          <Route path={ITEMS_PATH} element={<QueryParamProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function flushReactEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("WorkspaceRoutesLayout", () => {
  const workspace: Workspace = {
    id: "workspace-1",
    name: "Personal",
    ownerId: "user-1",
    planTier: "FREE",
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: ["jpg", "png", "pdf", "zip", "rar"],
    maxFileSizeMb: 2,
    filesInItemsEnabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    mocks.listWorkspaces.mockReset();
    mocks.listWorkspaceVaults.mockReset();
    mocks.logout.mockReset();
    mocks.folderTree = [];
    mocks.foldersLoading = false;
    mocks.foldersBootstrapped = false;
    mocks.listWorkspaces.mockResolvedValue([workspace]);
    mocks.listWorkspaceVaults.mockResolvedValue([]);
    mocks.core = {
      listWorkspaces: mocks.listWorkspaces,
      listWorkspaceVaults: mocks.listWorkspaceVaults,
      listWorkspacePersonalEvents: vi.fn().mockResolvedValue({
        workspaceId: "workspace-1",
        userId: "user-1",
        afterVersion: 0,
        events: [],
      }),
      appendWorkspacePersonalEvent: vi.fn(),
    };
  });

  it("keeps the workspace shell ready on query-only navigation", async () => {
    renderWorkspaceShell();

    await flushReactEffects();
    expect(screen.getByTestId("workspace-layout")).toBeInTheDocument();
    expect(mocks.listWorkspaces).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Select item" }));

    await flushReactEffects();

    expect(screen.getByTestId("item-query")).toHaveTextContent("item-1");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.listWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("removes unknown vault query param after vaults load", async () => {
    renderWorkspaceShell(`${ITEMS_PATH}?${VAULT_QUERY_PARAM}=missing-vault`);

    await flushReactEffects();

    const search = screen.getByTestId("search-query").textContent ?? "";
    expect(search).not.toContain(`${VAULT_QUERY_PARAM}=missing-vault`);
  });

  it("removes unknown folder query param after folders load", async () => {
    mocks.foldersBootstrapped = true;
    renderWorkspaceShell(`${ITEMS_PATH}?${FOLDER_QUERY_PARAM}=missing-folder`);

    await flushReactEffects();

    const search = screen.getByTestId("search-query").textContent ?? "";
    expect(search).not.toContain(`${FOLDER_QUERY_PARAM}=missing-folder`);
  });

  it("keeps known vault query param", async () => {
    mocks.listWorkspaceVaults.mockResolvedValue([
      {
        id: "vault-1",
        name: "Personal",
        workspaceId: "workspace-1",
        isPersonal: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderWorkspaceShell(`${ITEMS_PATH}?${VAULT_QUERY_PARAM}=vault-1`);

    await flushReactEffects();

    const search = screen.getByTestId("search-query").textContent ?? "";
    expect(search).toContain(`${VAULT_QUERY_PARAM}=vault-1`);
  });

  it("keeps folder query param before folders bootstrap completes", async () => {
    mocks.foldersBootstrapped = false;
    renderWorkspaceShell(`${ITEMS_PATH}?${FOLDER_QUERY_PARAM}=folder-1`);

    await flushReactEffects();

    const search = screen.getByTestId("search-query").textContent ?? "";
    expect(search).toContain(`${FOLDER_QUERY_PARAM}=folder-1`);
  });

  it("keeps known folder query param", async () => {
    mocks.foldersBootstrapped = true;
    mocks.folderTree = [{ id: "folder-1", label: "Docs" }];

    renderWorkspaceShell(`${ITEMS_PATH}?${FOLDER_QUERY_PARAM}=folder-1`);

    await flushReactEffects();

    const search = screen.getByTestId("search-query").textContent ?? "";
    expect(search).toContain(`${FOLDER_QUERY_PARAM}=folder-1`);
  });
});
