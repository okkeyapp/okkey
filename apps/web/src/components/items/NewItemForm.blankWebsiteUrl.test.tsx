import type { Vault } from "@okkey/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    accessToken: null,
    vaultKey: null,
    userId: "user-1",
  }),
}));

const { resolveVaultEncryptionKey } = vi.hoisted(() => ({
  resolveVaultEncryptionKey: vi.fn(async () => new Uint8Array(32)),
}));

vi.mock("../../items/WorkspaceItemsContext", () => ({
  useWorkspaceItems: () => ({
    fileUploadConstraints: { allowedExtensions: ["pdf"], maxSizeBytes: 1024 },
    filesInItemsEnabled: false,
    bootstrapped: true,
    resolveVaultEncryptionKey,
  }),
}));

vi.mock("../../folders/WorkspaceFoldersContext", () => ({
  useWorkspaceFolders: () => ({
    flatFolders: [],
    createFolder: vi.fn(),
  }),
}));

vi.mock("./NewItemSaveLocationSection", () => ({
  default: () => null,
  useSyncedNewItemVaultId: () => ["vault-1", () => {}],
}));

const reportedSections: { current: unknown[] | null } = { current: null };

vi.mock("../key-form/KeyFormEditor", () => ({
  KeyFormEditor: ({
    onSectionsChange,
  }: {
    onSectionsChange?: (sections: unknown) => void;
  }) => (
    <button type="button" onClick={() => onSectionsChange?.(reportedSections.current)}>
      Add URL
    </button>
  ),
}));

import { LocaleProvider } from "../../locale/LocaleContext";
import NewItemForm, {
  buildItemFromNewItemSavePayload,
  type NewItemFormHandle,
  type NewItemFormInitialValues,
} from "./NewItemForm";

const vault: Vault = {
  id: "vault-1",
  workspaceId: "workspace-1",
  name: "Personal",
  description: "",
  icon: "🔐",
  isPersonal: true,
  cryptoVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const t = (key: string) =>
  (
    {
      "web.newItemPopup.save": "Save",
      "web.newItemPopup.recordNameLabel": "Item name",
      "web.newItemPopup.recordNamePlaceholder": "Name",
      "web.newItemPopup.saveTo": "Save to",
      "web.newItemPopup.noFolder": "No folder",
    } as Record<string, string>
  )[key] ?? key;

function loginSections(extraUrl: string, extraRequired = true) {
  return [
    {
      id: "credentials",
      variant: "primary" as const,
      fields: [
        { id: "login", type: "text" as const, label: "login", value: "qa-login", required: true, editableLabel: false },
        {
          id: "password",
          type: "password" as const,
          label: "password",
          value: "secret",
          required: true,
          editableLabel: false,
          secret: true,
        },
      ],
    },
    {
      id: "websites",
      variant: "primary" as const,
      fields: [
        {
          id: "website-1",
          type: "url" as const,
          label: "website URL",
          value: "https://qa13.example.com",
          required: true,
          editableLabel: true,
        },
        {
          id: "website-2",
          type: "url" as const,
          label: "website URL",
          value: extraUrl,
          required: extraRequired,
          editableLabel: true,
          deletable: true,
        },
      ],
    },
  ];
}

function SaveHarness({
  initialValues,
  onSaved,
}: {
  initialValues?: NewItemFormInitialValues;
  onSaved: (urls: string[]) => void;
}) {
  const [canSave, setCanSave] = useState(false);
  const formRef = useRef<NewItemFormHandle>(null);

  return (
    <LocaleProvider>
      <NewItemForm
        ref={formRef}
        t={t}
        categoryId="login"
        workspaceName="Personal"
        vaults={[vault]}
        vaultsListReady
        initialValues={initialValues}
        onCanSaveChange={setCanSave}
      />
      <button
        type="button"
        disabled={!canSave}
        onClick={() => {
          const payload = formRef.current?.getSavePayload();
          expect(payload).not.toBeNull();
          const item = buildItemFromNewItemSavePayload({
            ...payload!,
            createdAtMs: payload!.createdAtMs ?? 1,
          });
          onSaved(
            item.fields
              .filter((field) => field.type === "url")
              .map((field) => (field.value.kind === "url" ? field.value.url : "")),
          );
        }}
      >
        Save
      </button>
    </LocaleProvider>
  );
}

describe("NewItemForm blank extra website URL", () => {
  it("enables Save and omits the empty extra URL", async () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
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
      },
    });
    reportedSections.current = loginSections("   ", true);
    const saved: string[][] = [];

    render(<SaveHarness onSaved={(urls) => saved.push(urls)} />);

    const name = screen.getByRole("textbox", { name: "Item name" });
    fireEvent.change(name, { target: { value: "QA blank extra URL" } });
    fireEvent.click(screen.getByRole("button", { name: "Add URL" }));

    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => {
      expect(save).toBeEnabled();
    });

    fireEvent.click(save);
    expect(saved).toEqual([["https://qa13.example.com"]]);
  });
});
