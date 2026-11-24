import type { ItemPlaintextV2, Vault } from "@okkey/types";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  item: null as ItemPlaintextV2 | null,
  syncSpy: vi.fn(),
  previewItemFavicon: vi.fn(),
  uploadEncryptedAttachment: vi.fn(),
  deleteKeyFieldFileAttachment: vi.fn(),
  updateItem: vi.fn(async (..._args: unknown[]) => undefined),
  resolveVaultEncryptionKey: vi.fn(async () => new Uint8Array(32)),
}));

vi.mock("../../items/faviconMode", () => ({
  useFaviconProviderMode: () => "direct",
  loadFaviconProviderMode: async () => "direct",
  resetFaviconProviderModeCache: () => undefined,
  useClientWebsiteIconSrc: () => undefined,
}));

vi.mock("../../api/item-favicons", () => ({
  previewItemFavicon: mocks.previewItemFavicon,
}));

vi.mock("../../api/key-field-files", () => ({
  uploadEncryptedAttachment: mocks.uploadEncryptedAttachment,
  deleteKeyFieldFileAttachment: mocks.deleteKeyFieldFileAttachment,
  downloadKeyFieldFileAttachment: vi.fn(),
  downloadKeyFieldFileAttachmentBytes: vi.fn(),
  uploadKeyFieldFileAttachment: vi.fn(),
}));

vi.mock("../../items/syncItemFavicon", async () => {
  const actual = await vi.importActual<typeof import("../../items/syncItemFavicon")>(
    "../../items/syncItemFavicon",
  );
  return {
    ...actual,
    syncItemFaviconForPlaintext: (
      ...args: Parameters<typeof actual.syncItemFaviconForPlaintext>
    ) => {
      mocks.syncSpy(...args);
      return actual.syncItemFaviconForPlaintext(...args);
    },
  };
});

vi.mock("../../auth/usePopupZoneGate", () => ({
  usePopupZoneGate: (_zone: string, open: boolean) => open,
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    accessToken: "token",
    vaultKey: new Uint8Array(32),
    userId: "user-1",
  }),
  useAuthenticatedCoreClient: () => ({
    createWorkspaceItemTemplate: vi.fn(),
    updateWorkspaceItemTemplate: vi.fn(),
  }),
}));

vi.mock("../../items/WorkspaceItemsContext", () => ({
  useWorkspaceItems: () => ({
    fileUploadConstraints: { allowedExtensions: ["png"], maxSizeBytes: 1024 },
    filesInItemsEnabled: false,
    bootstrapped: false,
    resolveVaultEncryptionKey: mocks.resolveVaultEncryptionKey,
    getItemById: (itemId: string) => (mocks.item?.itemId === itemId ? mocks.item : undefined),
    updateItem: mocks.updateItem,
    getItemCreatedByUserId: () => "user-1",
  }),
}));

vi.mock("../../items/WorkspaceVaultProfilesContext", () => ({
  useWorkspaceVaultProfiles: () => ({
    canPutItem: () => true,
    canPostToVault: () => true,
  }),
}));

vi.mock("../../folders/WorkspaceFoldersContext", () => ({
  useWorkspaceFolders: () => ({
    flatFolders: [],
    createFolder: vi.fn(),
    assignItemToFolder: vi.fn(),
    itemFolderByItemId: new Map<string, string>(),
  }),
}));

vi.mock("../../items/useWorkspaceItemTemplates", () => ({
  useWorkspaceItemTemplates: () => ({ refresh: vi.fn() }),
}));

vi.mock("./useItemCategoryPreferences", () => ({
  useItemCategoryPreferences: () => ({
    favoriteTemplateIdSet: new Set<string>(),
    toggleTemplateFavorite: vi.fn(),
  }),
}));

import { createKeyFormEditorMessages } from "../key-form/keyFormI18n";
import { LocaleProvider } from "../../locale/LocaleContext";
import { keyFormSectionsToItemPlaintext } from "../../items/keyFormToItemPlaintext";
import EditItemPopup from "./EditItemPopup";
import { getDefaultSectionsForCategory } from "./itemCategoryDefaultSections";

const ITEM_ID = "1000000000000000001";
const VAULT_ID = "1000000000000000002";
const FAVICON_ID = "1000000000000000099";

const vault: Vault = {
  id: VAULT_ID,
  workspaceId: "workspace-1",
  name: "Personal",
  description: "",
  icon: "vault",
  isPersonal: true,
  cryptoVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const labels: Record<string, string> = {
  "web.newItemPopup.save": "Save",
  "web.newItemPopup.cancel": "Cancel",
  "web.editItemPopup.title": "Edit item",
  "web.settingsPopup.close": "Close",
  "web.newItemPopup.recordNameLabel": "Item name",
  "web.newItemPopup.recordNamePlaceholder": "Name",
  "web.items.list.actions": "Actions",
  "web.newItemPopup.saveTemplate": "Save as template",
  "web.newItemPopup.uploadIcon": "Upload icon",
  "web.newItemPopup.uploadIconInvalid": "Invalid icon",
  "web.toast.save.loading": "Saving",
  "web.toast.save.success": "Saved",
  "web.toast.save.error": "Could not save",
  "web.toast.save.conflict": "Conflict",
  "web.editItemPopup.saveErrorGeneric": "Could not save",
  "web.editItemPopup.saveConflict": "Conflict",
};

const t = (key: string) => labels[key] ?? key;

function buildLoginItem(): ItemPlaintextV2 {
  const messages = createKeyFormEditorMessages("en");
  const sections = getDefaultSectionsForCategory("login", messages).map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      if (field.id === "login") {
        return { ...field, value: "ada" };
      }
      if (field.id === "password") {
        return { ...field, value: "secret-pass" };
      }
      if (field.id === "website-1") {
        return { ...field, value: "https://example.com" };
      }
      return field;
    }),
  }));
  const built = keyFormSectionsToItemPlaintext({
    sections,
    itemId: ITEM_ID,
    vaultId: VAULT_ID,
    title: "Example",
    categoryId: "login",
    nowMs: 1,
    tags: [],
  });
  return {
    ...built,
    faviconId: FAVICON_ID,
    faviconSource: "website",
  };
}

function renderEditPopup() {
  return render(
    <MemoryRouter initialEntries={[`/?popup=editItem|${ITEM_ID}`]}>
      <LocaleProvider>
        <EditItemPopup
          t={t}
          workspaceId="workspace-1"
          workspaceName="Personal"
          vaults={[vault]}
          vaultsListReady
        />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

async function settleFormBaseline() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

async function waitPastDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

beforeEach(() => {
  // Node 25 exposes a broken global localStorage when --localstorage-file has no path.
  installMemoryLocalStorage();
  mocks.item = buildLoginItem();
  mocks.syncSpy.mockReset();
  mocks.previewItemFavicon.mockReset();
  mocks.previewItemFavicon.mockResolvedValue(
    new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" }),
  );
  mocks.uploadEncryptedAttachment.mockReset();
  mocks.deleteKeyFieldFileAttachment.mockReset();
  mocks.updateItem.mockClear();
  mocks.resolveVaultEncryptionKey.mockClear();
  URL.createObjectURL = vi.fn(() => "blob:favicon-preview");
  URL.revokeObjectURL = vi.fn();
});

describe("EditItemPopup favicon requests", () => {
  it("does not preview, upload, or delete when editing the username of an item that already has an icon", async () => {
    renderEditPopup();
    await settleFormBaseline();
    await waitPastDebounce();
    expect(mocks.previewItemFavicon).not.toHaveBeenCalled();

    const name = screen.getByRole("textbox", { name: "Item name" });
    fireEvent.change(name, { target: { value: "Exampl" } });
    fireEvent.change(name, { target: { value: "Example" } });

    const login = screen.getByDisplayValue("ada");
    fireEvent.change(login, { target: { value: "ada-" } });
    fireEvent.change(login, { target: { value: "ada-2" } });
    fireEvent.blur(login);

    const password = document.querySelector<HTMLInputElement>("[data-password-generator-trigger]");
    expect(password).not.toBeNull();
    fireEvent.change(password!, { target: { value: "secret-pass-2" } });
    fireEvent.blur(password!);

    const website = screen.getByDisplayValue("https://example.com");
    fireEvent.focus(website);
    fireEvent.blur(website);

    await waitPastDebounce();
    expect(mocks.previewItemFavicon).not.toHaveBeenCalled();

    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(mocks.updateItem).toHaveBeenCalled());
    expect(mocks.previewItemFavicon).not.toHaveBeenCalled();
    expect(mocks.syncSpy).not.toHaveBeenCalled();
    expect(mocks.uploadEncryptedAttachment).not.toHaveBeenCalled();
    expect(mocks.deleteKeyFieldFileAttachment).not.toHaveBeenCalled();

    const saved = mocks.updateItem.mock.calls[0]?.[0] as ItemPlaintextV2;
    expect(saved.faviconId).toBe(FAVICON_ID);
    expect(saved.faviconSource).toBe("website");
    expect(saved.fields.some((field) => field.value.kind === "text" && field.value.text === "ada-2")).toBe(true);
  });

  it("requests the favicon once after the website URL blurs, not while typing", async () => {
    renderEditPopup();
    await settleFormBaseline();
    await waitPastDebounce();
    expect(mocks.previewItemFavicon).not.toHaveBeenCalled();

    const website = screen.getByDisplayValue("https://example.com");
    fireEvent.change(website, { target: { value: "https://example.com/a" } });
    fireEvent.change(website, { target: { value: "https://example.com/ab" } });
    await waitPastDebounce();
    expect(mocks.previewItemFavicon).not.toHaveBeenCalled();

    fireEvent.blur(website);
    await waitPastDebounce();
    expect(mocks.previewItemFavicon).toHaveBeenCalledTimes(1);
    expect(mocks.previewItemFavicon).toHaveBeenCalledWith(
      "token",
      ["https://example.com/ab"],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await waitPastDebounce();
    expect(mocks.previewItemFavicon).toHaveBeenCalledTimes(1);
  });

  it("re-requests once when the committed name changes and still does not replace the stored icon", async () => {
    renderEditPopup();
    await settleFormBaseline();

    const name = screen.getByRole("textbox", { name: "Item name" });
    fireEvent.change(name, { target: { value: "Example renamed" } });
    await waitPastDebounce();
    expect(mocks.previewItemFavicon).not.toHaveBeenCalled();

    fireEvent.blur(name);
    await waitPastDebounce();
    expect(mocks.previewItemFavicon).toHaveBeenCalledTimes(1);

    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(mocks.updateItem).toHaveBeenCalled());
    expect(mocks.previewItemFavicon).toHaveBeenCalledTimes(1);
    expect(mocks.syncSpy).not.toHaveBeenCalled();
    expect(mocks.uploadEncryptedAttachment).not.toHaveBeenCalled();
    expect(mocks.deleteKeyFieldFileAttachment).not.toHaveBeenCalled();
    const saved = mocks.updateItem.mock.calls[0]?.[0] as ItemPlaintextV2;
    expect(saved.faviconId).toBe(FAVICON_ID);
    expect(saved.title).toBe("Example renamed");
  });
});
