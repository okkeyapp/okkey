import type { WebMessageValues } from "@okkey/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";

const updateItemQuiet = vi.fn(async () => "ok");
const getItemById = vi.fn();

vi.mock("../../items/WorkspaceItemsContext", () => ({
  useWorkspaceItems: () => ({
    getItemById,
    updateItemQuiet,
    records: [
      {
        id: "login-google",
        vaultId: "vault-1",
        folderId: null,
        categoryId: "login",
        urls: ["https://accounts.google.com"],
        title: "Google",
        description: "",
        tags: [],
        date: new Date("2026-01-01"),
        favorite: false,
        archived: false,
        deleted: false,
      },
    ],
  }),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({ accessToken: null }),
}));

vi.mock("../../items/useResolvedVaultEncryptionKey", () => ({
  useResolvedVaultEncryptionKey: () => null,
}));

vi.mock("../../items/useItemFaviconAttachmentUrl", () => ({
  useItemFaviconAttachmentUrl: () => ({ imageSrc: null, loading: false }),
}));

vi.mock("../../items/faviconMode", () => ({
  useClientWebsiteIconSrc: () => null,
}));

vi.mock("./ItemRecordFavicon", () => ({
  default: () => <span data-testid="favicon" />,
}));

import ItemSignInWithDetail from "./ItemSignInWithDetail";

function loginItem(overrides: Partial<ItemPlaintextV2> = {}): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: "login-app",
    vaultId: "vault-1",
    title: "App",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [],
    fields: [],
    ...overrides,
  };
}

const t = (key: string, values?: WebMessageValues) => {
  const map: Record<string, string> = {
    "web.newItemPopup.signInWith.label": "Sign in with",
    "web.items.detail.signInWith.linkLost": "Link lost",
    "web.items.detail.signInWith.clear": "Clear",
    "web.items.detail.signInWith.openAria": `Open linked item "${String(values?.title ?? "")}"`,
  };
  return map[key] ?? key;
};

describe("ItemSignInWithDetail", () => {
  it("shows the linked login title and opens it on click", () => {
    getItemById.mockImplementation((id: string) =>
      id === "login-google"
        ? loginItem({ itemId: "login-google", title: "Google" })
        : undefined,
    );

    render(
      <MemoryRouter initialEntries={["/items?item=login-app"]}>
        <ItemSignInWithDetail
          t={t}
          itemId="login-app"
          linkedAccountItemId="login-google"
          canEdit
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Google")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: 'Open linked item "Google"' }));
  });

  it("shows link lost and clears the field on Clear", async () => {
    const current = loginItem({ linkedAccountItemId: "missing-login" });
    getItemById.mockImplementation((id: string) => (id === "login-app" ? current : undefined));

    render(
      <MemoryRouter>
        <ItemSignInWithDetail
          t={t}
          itemId="login-app"
          linkedAccountItemId="missing-login"
          canEdit
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Link lost")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(updateItemQuiet).toHaveBeenCalled();
    });
    const saved = updateItemQuiet.mock.calls.at(0)?.at(0) as ItemPlaintextV2 | undefined;
    expect(saved?.linkedAccountItemId).toBeUndefined();
  });

  it("renders nothing when there is no linked account", () => {
    const { container } = render(
      <MemoryRouter>
        <ItemSignInWithDetail t={t} itemId="login-app" linkedAccountItemId={undefined} canEdit />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
