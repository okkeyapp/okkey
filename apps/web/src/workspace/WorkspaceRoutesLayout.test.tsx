import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Workspace } from "@okkey/types";

import { ITEM_QUERY_PARAM, ITEMS_PATH } from "../routes/paths";
import WorkspaceRoutesLayout from "./WorkspaceRoutesLayout";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  listWorkspaceVaults: vi.fn(),
  logout: vi.fn(),
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
  }),
  useAuthenticatedCoreClient: () => mocks.core,
}));

vi.mock("../locale/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en",
    t: (key: string, params?: Record<string, string>) => (params?.id ? `${key}:${params.id}` : key),
  }),
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    mocks.listWorkspaces.mockReset();
    mocks.listWorkspaceVaults.mockReset();
    mocks.logout.mockReset();
    mocks.listWorkspaces.mockResolvedValue([workspace]);
    mocks.listWorkspaceVaults.mockResolvedValue([]);
    mocks.core = {
      listWorkspaces: mocks.listWorkspaces,
      listWorkspaceVaults: mocks.listWorkspaceVaults,
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
});
